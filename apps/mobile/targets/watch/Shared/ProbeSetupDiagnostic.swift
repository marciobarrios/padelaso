import Foundation

enum ProbeSetupStage: String, Codable {
  case ready, validating, saving, transferring, queued, confirmed, cleared, failed
}

enum ProbeConnectionIssue: String, Error {
  case unsupported, activating, notPaired, appMissing
}

struct ProbeConnectionSnapshot: Codable, Equatable {
  let supported: Bool
  let activated: Bool
  let paired: Bool
  let appInstalled: Bool

  var issue: ProbeConnectionIssue? {
    if !supported { return .unsupported }
    if !activated { return .activating }
    if !paired { return .notPaired }
    if !appInstalled { return .appMissing }
    return nil
  }

  var message: String {
    switch issue {
    case .unsupported: return "Este dispositivo no admite WatchConnectivity."
    case .activating: return "La conexión con el Watch se está activando."
    case .notPaired: return "iOS no detecta un Watch emparejado."
    case .appMissing: return "iOS no detecta Padelaso Test instalado en el Watch."
    case nil: return "Watch emparejado y app instalada."
    }
  }
}

// Allowlisted diagnostics only. Never include setup, URLs, request/response
// bodies, token values or raw error descriptions in this record.
struct ProbeSetupDiagnostic: Codable {
  let timestamp: Date
  let stage: ProbeSetupStage
  let connection: ProbeConnectionSnapshot
  let failureCode: String?
  let httpStatus: Int?
  let networkCode: Int?
}

struct ProbeSetupFailure {
  let code: String
  let message: String
  var httpStatus: Int? = nil
  var networkCode: Int? = nil

  static func describe(_ error: Error, stage: ProbeSetupStage) -> ProbeSetupFailure {
    if let connection = error as? ProbeConnectionIssue {
      let messages: [ProbeConnectionIssue: String] = [
        .unsupported: "Este iPhone no admite la conexión con el Watch.",
        .activating: "La sesión del Watch aún se está activando. Espera unos segundos y vuelve a enviar.",
        .notPaired: "La web validó el partido, pero iOS no detecta un Watch emparejado.",
        .appMissing: "La web validó el partido, pero iOS no detecta Padelaso Test en el Watch. Abre la app en el reloj y revisa su instalación en la app Watch.",
      ]
      return .init(code: "watch_\(connection.rawValue)", message: messages[connection]!)
    }
    if let probe = error as? ProbeError {
      switch probe {
      case .http(let status):
        let detail: String
        switch status {
        case 300..<400: detail = "La web redirige esta dirección. Usa el origen HTTPS exacto de la app."
        case 401: detail = "La web rechazó el token. Copia de nuevo el Token de Padelaso desde Scorekeeper."
        case 403: detail = "La web denegó el acceso. Revisa los permisos de la cuenta del token."
        case 404: detail = "No se encontró el partido o la API. Revisa el origen de la app."
        case 409: detail = "El token no tiene un partido activo. Activa el partido de prueba en Scorekeeper."
        case 429: detail = "Se alcanzó el límite de peticiones. Espera un minuto antes de validar otra vez."
        default: detail = "La web no pudo validar el partido."
        }
        return .init(code: "http_\(status)", message: "\(detail) (HTTP \(status))", httpStatus: status)
      case .wrongMatch:
        return .init(code: "wrong_match", message: "El token apunta a otro partido. Revisa el ID y el partido activo en Scorekeeper.")
      case .invalidResponse:
        return .init(code: "invalid_response", message: "La web respondió sin opciones de partido válidas. No se envió configuración al Watch.")
      case .storage:
        return .init(code: "storage", message: "No se pudo guardar la configuración de forma segura en el iPhone.")
      default: break
      }
    }
    if let network = error as? URLError {
      let detail = network.code == .timedOut ? "La web tardó demasiado en responder." : "No se pudo conectar con la web. Revisa la conexión del iPhone."
      return .init(code: "network", message: "\(detail) (Red \(network.code.rawValue))", networkCode: network.code.rawValue)
    }
    if stage == .saving {
      return .init(code: "storage", message: "No se pudo guardar la configuración de forma segura en el iPhone.")
    }
    if stage == .transferring {
      return .init(code: "watch_transfer", message: "El partido se validó y guardó, pero no pudo enviarse al Watch. Abre ambas apps y pulsa Reenviar configuración guardada.")
    }
    return .init(code: "validation", message: "No se pudo validar la configuración. Revisa el origen, token e ID del partido.")
  }
}
