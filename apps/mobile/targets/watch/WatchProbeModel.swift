import Foundation
import WatchConnectivity

@MainActor
final class WatchProbeModel: NSObject, ObservableObject, WCSessionDelegate {
  @Published private(set) var context: ProbeContext?
  @Published private(set) var options: ProbeOptions?
  @Published private(set) var status = "Abre Configuración en el iPhone y prepara la prueba del Watch."
  @Published private(set) var busy = false
  @Published private(set) var ledger = ProbeLedger()
  private var storageReady = false
  private var pendingPayload: [String: Any]?
  private let api = ProbeAPI()

  override init() {
    super.init()
    do {
      ledger = try ProbeVault.read("attempts", as: ProbeLedger.self) ?? ProbeLedger()
      context = try ProbeVault.read("context", as: ProbeContext.self)?.validated()
      storageReady = true
      if context != nil { status = "Configuración guardada. Carga las opciones del partido." }
    } catch { status = "No se pudo leer el almacenamiento. No se enviará ninguna acción." }
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  func outcome(_ action: ProbeAction) -> ProbeOutcome? {
    guard let context else { return nil }
    return ledger.outcome(action, context: context)
  }

  func load() async {
    guard let context, !busy, storageReady else { return }
    busy = true
    defer { finish() }
    do {
      options = try await api.options(context: context)
      status = "Partido verificado. Un intento por acción."
    } catch {
      options = nil
      status = "No se pudo verificar el partido. Comprueba la conexión y el partido activo."
    }
  }

  func submit(_ action: ProbeAction, team: Int, event: String, player: String) async {
    guard let context, !busy, storageReady, outcome(action) == nil else { return }
    busy = true
    defer { finish() }
    var reserved = false
    do {
      let latest = try await api.options(context: context)
      guard (team == 1 || team == 2),
        action == .score || (latest.events[event] != nil && latest.players[player] != nil)
      else { throw ProbeError.invalidSetup }
      var next = ledger
      try next.reserve(action, context: context)
      // Persist unknown BEFORE starting POST. A crash cannot re-arm this action.
      try ProbeVault.write("attempts", value: next)
      ledger = next
      reserved = true
      status = "Enviando una vez…"
      try await api.submit(action, context: context, team: team,
        event: latest.events[event] ?? "", player: latest.players[player] ?? "")
      next.confirm(action, context: context)
      try ProbeVault.write("attempts", value: next)
      ledger = next
      status = "Servidor confirmó el envío. Comprueba el resultado en la web."
    } catch {
      status = reserved
        ? "Resultado desconocido. Comprueba la web. Esta acción no se reenviará."
        : "No se envió la acción: no se pudo verificar o guardar la prueba."
    }
  }

  private func finish() {
    busy = false
    if let payload = pendingPayload { pendingPayload = nil; receive(payload) }
  }

  private func receive(_ payload: [String: Any]) {
    if busy { pendingPayload = payload; return }
    guard payload["version"] as? Int == 1, let id = payload["id"] as? String else { return }
    do {
      // Re-read on context delivery so a locked Keychain never becomes an empty ledger.
      ledger = try ProbeVault.read("attempts", as: ProbeLedger.self) ?? ProbeLedger()
      if payload["clear"] as? Bool == true {
        try ProbeVault.remove("context")
        context = nil
        status = "Configuración borrada. El historial de intentos se conserva."
      } else {
        guard let data = payload["context"] as? Data else { throw ProbeError.invalidSetup }
        let next = try JSONDecoder().decode(ProbeContext.self, from: data).validated()
        try ProbeVault.write("context", value: next)
        context = next
        status = "Contexto recibido del iPhone. Carga las opciones del partido."
      }
      options = nil
      storageReady = true
      try WCSession.default.updateApplicationContext(["ack": id])
    } catch {
      status = "No se pudo guardar o confirmar el contexto. No se enviará ninguna acción."
      storageReady = false
    }
  }

  nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?) {
    let payload = session.receivedApplicationContext
    Task { @MainActor in receive(payload) }
  }
  nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    Task { @MainActor in receive(applicationContext) }
  }
}
