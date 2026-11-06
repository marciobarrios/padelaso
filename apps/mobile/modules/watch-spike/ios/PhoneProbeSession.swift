import Foundation
import WatchConnectivity

@MainActor
final class PhoneProbeSession: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = PhoneProbeSession()
  @Published private(set) var status = "Introduce el token de un partido de prueba."
  @Published private(set) var busy = false
  @Published private(set) var savedContext: ProbeContext?
  @Published private(set) var connection = ProbeConnectionSnapshot(
    supported: WCSession.isSupported(), activated: false, paired: false, appInstalled: false)
  private var stage = ProbeSetupStage.ready
  private var pendingID: String?

  override init() {
    super.init()
    savedContext = try? ProbeVault.read("phone-context", as: ProbeContext.self)?.validated()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  func prepareForm() {
    refreshConnection()
    guard !busy, stage != .queued, stage != .confirmed else { return }
    stage = .ready
    status = savedContext == nil
      ? "Introduce el origen, token e ID del partido de prueba."
      : "Hay una configuración guardada. Puedes validarla y reenviarla sin volver a escribir el token."
  }

  func invalidSetup() {
    record(.failed, "Introduce un origen HTTPS, token e ID válidos.",
      failure: .init(code: "invalid_setup", message: "Configuración incompleta."))
  }

  @discardableResult
  func send(_ context: ProbeContext) async -> Bool {
    guard !busy else { return false }
    busy = true
    pendingID = nil
    defer { busy = false }
    var operation = ProbeSetupStage.validating
    record(.validating, "Validando el token y el partido con la web…")
    do {
      _ = try await ProbeAPI().options(context: context)
      operation = .saving
      record(.saving, "Partido validado. Guardando la configuración…")
      try ProbeVault.write("phone-context", value: context)
      savedContext = context
      operation = .transferring
      record(.transferring, "Partido validado. Enviando al Watch…")
      try transfer(context)
      return true
    } catch {
      let failure = ProbeSetupFailure.describe(error, stage: operation)
      record(.failed, failure.message, failure: failure)
      return false
    }
  }

  func resend() async {
    guard let context = savedContext else {
      record(.failed, "No hay una configuración guardada. Completa el formulario primero.")
      return
    }
    await send(context)
  }

  private func transfer(_ context: ProbeContext?) throws {
    refreshConnection()
    if let issue = connection.issue { throw issue }
    let id = UUID().uuidString
    var payload: [String: Any] = ["version": 1, "id": id, "clear": context == nil]
    if let context { payload["context"] = try JSONEncoder().encode(context) }
    pendingID = id
    do { try WCSession.default.updateApplicationContext(payload) }
    catch { pendingID = nil; throw error }
    record(.queued, context == nil
      ? "Borrado en el iPhone. Esperando confirmación de borrado del Watch."
      : "Contexto enviado. Esperando confirmación del Watch. Abre la app en el reloj.")
  }

  func clear() {
    guard !busy else { return }
    do {
      try ProbeVault.remove("phone-context")
      savedContext = nil
      pendingID = nil
      try transfer(nil)
    } catch {
      record(.failed, "Borrado local. No se confirmó el borrado en el Watch; revoca el token en la web.")
    }
  }

  private func refreshConnection() {
    let supported = WCSession.isSupported()
    let active = supported && WCSession.default.activationState == .activated
    // Pair/install flags are only meaningful after activation.
    connection = ProbeConnectionSnapshot(supported: supported, activated: active,
      paired: active && WCSession.default.isPaired,
      appInstalled: active && WCSession.default.isWatchAppInstalled)
  }

  private func record(_ nextStage: ProbeSetupStage, _ message: String,
    failure: ProbeSetupFailure? = nil) {
    stage = nextStage
    status = message
    refreshConnection()
    let diagnostic = ProbeSetupDiagnostic(timestamp: Date(), stage: nextStage,
      connection: connection, failureCode: failure?.code,
      httpStatus: failure?.httpStatus, networkCode: failure?.networkCode)
    // Latest allowlisted state only. No token, origin, match ID, payload or raw
    // exception is written. This local cache can be read during device debugging.
    if let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
      let url = cache.appendingPathComponent("WatchProbeSetupDiagnostic.json")
      if let data = try? JSONEncoder().encode(diagnostic) {
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
      }
    }
  }

  nonisolated func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?) { Task { @MainActor in refreshConnection() } }
  nonisolated func sessionWatchStateDidChange(_ session: WCSession) {
    Task { @MainActor in refreshConnection() }
  }
  nonisolated func sessionDidBecomeInactive(_ session: WCSession) {
    Task { @MainActor in refreshConnection() }
  }
  nonisolated func sessionDidDeactivate(_ session: WCSession) { session.activate() }
  nonisolated func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
    let id = applicationContext["ack"] as? String
    Task { @MainActor in
      if let id, id == pendingID {
        record(.confirmed, savedContext == nil
          ? "El Watch confirmó que borró la configuración."
          : "El Watch confirmó que guardó el contexto.")
      }
    }
  }
}
