import Foundation

final class NoProbeRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(_ session: URLSession, task: URLSessionTask,
    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
    completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

final class ProbeAPI {
  private let session: URLSession

  init(session: URLSession? = nil) {
    if let session { self.session = session; return }
    let config = URLSessionConfiguration.ephemeral
    config.waitsForConnectivity = false
    config.timeoutIntervalForRequest = 15
    config.timeoutIntervalForResource = 20
    config.urlCache = nil
    config.httpCookieStorage = nil
    self.session = URLSession(configuration: config, delegate: NoProbeRedirects(), delegateQueue: nil)
  }

  private func request(_ path: String, context: ProbeContext, body: [String: Any]? = nil)
    async throws -> Data {
    var request = URLRequest(url: context.origin.appendingPathComponent(path))
    request.setValue("Bearer \(context.token)", forHTTPHeaderField: "Authorization")
    request.cachePolicy = .reloadIgnoringLocalCacheData
    if let body {
      request.httpMethod = "POST"
      request.httpBody = try JSONSerialization.data(withJSONObject: body)
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    let (data, response) = try await session.data(for: request)
    guard let http = response as? HTTPURLResponse else { throw ProbeError.invalidResponse }
    guard (200..<300).contains(http.statusCode) else { throw ProbeError.http(http.statusCode) }
    return data
  }

  func options(context: ProbeContext) async throws -> ProbeOptions {
    let data = try await request("api/shortcut/options", context: context)
    guard let result = try? JSONDecoder().decode(ProbeOptions.self, from: data) else {
      throw ProbeError.invalidResponse
    }
    guard result.ok, result.match.id.lowercased() == context.matchID else { throw ProbeError.wrongMatch }
    return result
  }

  // Exactly one application-level request. No retry queue, background session,
  // phone relay, or reachability-triggered resubmission.
  func submit(_ action: ProbeAction, context: ProbeContext, team: Int,
    event: String, player: String) async throws {
    let body: [String: Any] = action == .score
      ? ["team": team, "delta": 1]
      : ["type": event, "playerId": player]
    let data = try await request(action == .score ? "api/score" : "api/events",
      context: context, body: body)
    guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
      json["ok"] as? Bool == true,
      let match = json["match"] as? [String: Any],
      (match["id"] as? String)?.lowercased() == context.matchID
    else { throw ProbeError.invalidResponse }
  }
}
