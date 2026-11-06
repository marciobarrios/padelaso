import Foundation

enum ProbeError: Error {
  case invalidSetup, unavailable, wrongMatch, invalidResponse, alreadyAttempted, storage
  case http(Int)
}

// Test-only setup. The existing token resolves the active match on the server;
// preflight detects drift but cannot eliminate a race with a web-side switch.
struct ProbeContext: Codable, Equatable {
  let version: Int
  let origin: URL
  let token: String
  let matchID: String

  init(origin: String, token: String, matchID: String) throws {
    guard let url = URL(string: origin), url.scheme == "https",
      let host = url.host, !host.isEmpty, url.user == nil, url.password == nil,
      url.query == nil, url.fragment == nil,
      url.path.isEmpty || url.path == "/",
      token.count >= 16, token.count <= 512,
      token.allSatisfy({ $0.isASCII && !$0.isWhitespace && !$0.isNewline }),
      let id = UUID(uuidString: matchID)
    else { throw ProbeError.invalidSetup }
    version = 1
    self.origin = url
    self.token = token
    self.matchID = id.uuidString.lowercased()
  }

  func validated() throws -> ProbeContext {
    guard version == 1 else { throw ProbeError.invalidSetup }
    return try ProbeContext(origin: origin.absoluteString, token: token, matchID: matchID)
  }

  var ledgerKey: String {
    "\(origin.host!.lowercased()):\(origin.port ?? 443)/\(matchID)"
  }
}

struct ProbeOptions: Decodable {
  struct Match: Decodable { let id: String }
  let ok: Bool
  let match: Match
  let eventOptions: [String]
  let playerOptions: [String]
  let events: [String: String]
  let players: [String: String]
}

enum ProbeAction: String, Codable, CaseIterable { case score, event }
enum ProbeOutcome: String, Codable { case unknown, confirmed }

struct ProbeLedger: Codable {
  private(set) var attempts: [String: [String: ProbeOutcome]] = [:]

  func outcome(_ action: ProbeAction, context: ProbeContext) -> ProbeOutcome? {
    attempts[context.ledgerKey]?[action.rawValue]
  }

  mutating func reserve(_ action: ProbeAction, context: ProbeContext) throws {
    guard outcome(action, context: context) == nil else { throw ProbeError.alreadyAttempted }
    attempts[context.ledgerKey, default: [:]][action.rawValue] = .unknown
  }

  mutating func confirm(_ action: ProbeAction, context: ProbeContext) {
    attempts[context.ledgerKey, default: [:]][action.rawValue] = .confirmed
  }
}
