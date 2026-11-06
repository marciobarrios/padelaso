import SwiftUI

struct PhoneProbeSetup: View {
  @Environment(\.dismiss) private var dismiss
  @ObservedObject private var model = PhoneProbeSession.shared
  @State private var origin = ""
  @State private var token = ""
  @State private var matchID = ""
  @State private var testOnly = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Partido de prueba · MAR-44") {
          Text("Crea un partido desechable en la web y mantenlo activo hasta terminar la prueba.")
          TextField("Origen HTTPS de la web", text: $origin)
            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
          SecureField("Token de Atajos", text: $token)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
          TextField("ID del partido (UUID)", text: $matchID)
            .textInputAutocapitalization(.never).autocorrectionDisabled()
          Toggle("Confirmo que es un partido de prueba", isOn: $testOnly)
          Button {
            guard let context = try? ProbeContext(
              origin: origin.trimmingCharacters(in: .whitespacesAndNewlines),
              token: token.trimmingCharacters(in: .whitespacesAndNewlines),
              matchID: matchID.trimmingCharacters(in: .whitespacesAndNewlines)) else {
              model.invalidSetup()
              return
            }
            Task {
              // Keep the secure field intact on validation/transfer failure.
              if await model.send(context) { token = "" }
            }
          } label: {
            if model.busy { ProgressView("Validando y enviando…") }
            else { Text("Validar y enviar al Watch") }
          }.disabled(!testOnly)
        }.disabled(model.busy)
        Section("Conexión con el Watch") {
          Text(model.connection.message)
          Text(model.status).accessibilityAddTraits(.updatesFrequently)
          Button("Reenviar configuración guardada") { Task { await model.resend() } }
            .disabled(model.busy || model.savedContext == nil)
          Button("Borrar configuración", role: .destructive) { model.clear() }
            .disabled(model.busy)
          Text("Borrar no revoca el token del servidor. Revócalo en la web al finalizar. La prueba admite un intento de marcador y uno de evento por partido; no reintenta los envíos.")
            .font(.footnote)
        }
      }
      .onAppear {
        model.prepareForm()
        if let saved = model.savedContext {
          origin = saved.origin.absoluteString
          matchID = saved.matchID
        }
      }
      .onDisappear { token = "" }
      .navigationTitle("Prueba del Watch")
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Cerrar") { dismiss() } } }
    }
  }
}
