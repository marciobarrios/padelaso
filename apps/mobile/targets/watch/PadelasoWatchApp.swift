import SwiftUI

@main
struct PadelasoWatchApp: App {
  @StateObject private var model = WatchProbeModel()
  @State private var team = 1
  @State private var event = ""
  @State private var player = ""
  @State private var confirming: ProbeAction?

  var body: some Scene {
    WindowGroup {
      NavigationStack {
        List {
          if let context = model.context {
            Section("Partido de prueba") {
              Text(context.matchID).font(.caption2)
              Text(context.origin.host ?? "").font(.caption2)
              Button("Cargar opciones") { Task { await model.load() } }.disabled(model.busy)
            }
            if let options = model.options {
              Section("Marcador") {
                Picker("Equipo", selection: $team) {
                  Text("Equipo 1").tag(1)
                  Text("Equipo 2").tag(2)
                }
                actionButton(.score, title: "Sumar 1 juego")
              }
              Section("Evento") {
                Picker("Jugador", selection: $player) {
                  Text("Seleccionar").tag("")
                  ForEach(options.playerOptions, id: \.self) { Text($0).tag($0) }
                }
                Picker("Evento", selection: $event) {
                  Text("Seleccionar").tag("")
                  ForEach(options.eventOptions, id: \.self) { Text($0).tag($0) }
                }
                actionButton(.event, title: "Registrar evento")
                  .disabled(event.isEmpty || player.isEmpty)
              }
            }
          }
          Section("Estado") {
            Text(model.status).font(.footnote)
            Text("Sin reintentos. Ante una interrupción, comprueba la web.").font(.footnote)
          }
        }
        .navigationTitle("Padelaso · Prueba")
        .confirmationDialog("¿Enviar esta acción una sola vez?", isPresented: Binding(
          get: { confirming != nil }, set: { if !$0 { confirming = nil } }
        ), titleVisibility: .visible) {
          if let action = confirming {
            Button("Confirmar envío") {
              confirming = nil
              Task { await model.submit(action, team: team, event: event, player: player) }
            }
          }
          Button("Cancelar", role: .cancel) { confirming = nil }
        }
      }
    }
  }

  private func actionButton(_ action: ProbeAction, title: String) -> some View {
    VStack(alignment: .leading) {
      Button(title) { confirming = action }
        .disabled(model.busy || model.outcome(action) != nil)
      if let outcome = model.outcome(action) {
        Text(outcome == .confirmed ? "Confirmado por el servidor" : "Intento guardado · revisa la web")
          .font(.caption2)
      }
    }
  }
}
