import XCTest
@testable import WatchSpikeCore

private final class StubProtocol: URLProtocol {
  static var handler: ((URLRequest) throws -> (Int, Data))!
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    do {
      let (status, data) = try Self.handler(request)
      client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status,
        httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch { client?.urlProtocol(self, didFailWithError: error) }
  }
  override func stopLoading() {}
}

final class ProbeTests: XCTestCase {
  private let matchID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
  private func context(token: String = "test-token-not-a-real-secret") throws -> ProbeContext {
    try ProbeContext(origin: "https://test.example", token: token, matchID: matchID)
  }
  private func api() -> ProbeAPI {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [StubProtocol.self]
    return ProbeAPI(session: URLSession(configuration: config))
  }

  private func body(_ request: URLRequest) throws -> [String: Any] {
    var data = request.httpBody ?? Data()
    if let stream = request.httpBodyStream {
      stream.open()
      defer { stream.close() }
      var buffer = [UInt8](repeating: 0, count: 1024)
      while stream.hasBytesAvailable {
        let count = stream.read(&buffer, maxLength: buffer.count)
        guard count > 0 else { break }
        data.append(buffer, count: count)
      }
    }
    return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
  }

  func testRejectsUnsafeSetupAndUnknownContractVersion() throws {
    for origin in ["http://test.example", "https://user:password@test.example", "https://test.example/api", "https://test.example?token=x"] {
      XCTAssertThrowsError(try ProbeContext(origin: origin, token: "test-token-not-a-real-secret", matchID: matchID))
    }
    XCTAssertThrowsError(try ProbeContext(origin: "https://test.example", token: "token\r\ninjected", matchID: matchID))
    let data = try JSONEncoder().encode(context())
    var json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    json["version"] = 2
    let decoded = try JSONDecoder().decode(ProbeContext.self, from: JSONSerialization.data(withJSONObject: json))
    XCTAssertThrowsError(try decoded.validated())
  }

  func testAttemptSurvivesRelaunchTokenRotationAndOriginSpelling() throws {
    var ledger = ProbeLedger()
    let setup = try context()
    try ledger.reserve(.score, context: setup)
    let restored = try JSONDecoder().decode(ProbeLedger.self, from: JSONEncoder().encode(ledger))
    XCTAssertEqual(restored.outcome(.score, context: setup), .unknown)
    var reloaded = restored
    let rotated = try ProbeContext(origin: "https://TEST.example:443/", token: "rotated-test-token-only", matchID: matchID)
    XCTAssertThrowsError(try reloaded.reserve(.score, context: rotated))
    try reloaded.reserve(.event, context: rotated)
    reloaded.confirm(.score, context: rotated)
    XCTAssertThrowsError(try reloaded.reserve(.score, context: setup))
  }

  func testPreflightRejectsDifferentActiveMatch() async throws {
    StubProtocol.handler = { _ in
      (200, Data("""
        {"ok":true,"match":{"id":"different"},"eventOptions":[],"playerOptions":[],"events":{},"players":{}}
        """.utf8))
    }
    do { _ = try await api().options(context: context()); XCTFail("Must reject drift") }
    catch ProbeError.wrongMatch {} catch { XCTFail("Unexpected error") }
  }

  func testPreflightPreservesHTTPFailureWithoutRetrying() async throws {
    var requests = 0
    StubProtocol.handler = { _ in
      requests += 1
      return (401, Data("{\"error\":\"untrusted-response-text\"}".utf8))
    }
    do { _ = try await api().options(context: context()); XCTFail("Must reject HTTP 401") }
    catch ProbeError.http(let status) { XCTAssertEqual(status, 401) }
    catch { XCTFail("Must retain the HTTP status") }
    XCTAssertEqual(requests, 1)
  }

  func testMalformedOptionsAreReportedAsInvalidResponse() async throws {
    StubProtocol.handler = { _ in (200, Data("<html>not API JSON</html>".utf8)) }
    do { _ = try await api().options(context: context()); XCTFail("Must reject non-JSON data") }
    catch ProbeError.invalidResponse {} catch { XCTFail("Must classify the response format") }
  }

  func testConnectionDiagnosisChecksActivationBeforePairingAndInstallation() {
    XCTAssertEqual(ProbeConnectionSnapshot(supported: true, activated: false,
      paired: false, appInstalled: false).issue, .activating)
    XCTAssertEqual(ProbeConnectionSnapshot(supported: true, activated: true,
      paired: false, appInstalled: false).issue, .notPaired)
    XCTAssertEqual(ProbeConnectionSnapshot(supported: true, activated: true,
      paired: true, appInstalled: false).issue, .appMissing)
    XCTAssertNil(ProbeConnectionSnapshot(supported: true, activated: true,
      paired: true, appInstalled: true).issue)
  }

  func testSetupDiagnosticsExcludeRawErrorDataAndCredentials() throws {
    let secret = "private-token-and-response-content"
    let error = NSError(domain: "example", code: 1,
      userInfo: [NSLocalizedDescriptionKey: secret])
    let failure = ProbeSetupFailure.describe(error, stage: .transferring)
    XCTAssertEqual(failure.code, "watch_transfer")
    XCTAssertFalse(failure.message.contains(secret))
    let diagnostic = ProbeSetupDiagnostic(timestamp: Date(), stage: .failed,
      connection: .init(supported: true, activated: true, paired: true, appInstalled: true),
      failureCode: failure.code, httpStatus: nil, networkCode: nil)
    let data = try JSONEncoder().encode(diagnostic)
    let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    XCTAssertEqual(Set(json.keys), ["timestamp", "stage", "connection", "failureCode"])
    XCTAssertFalse(String(decoding: data, as: UTF8.self).contains(secret))
    XCTAssertEqual(ProbeSetupFailure.describe(ProbeError.http(401), stage: .validating).httpStatus, 401)
    XCTAssertEqual(ProbeSetupFailure.describe(URLError(.timedOut), stage: .validating).networkCode, -1001)
  }

  func testMutationUsesBearerAndExpectedBody() async throws {
    let setup = try context()
    var requests = 0
    StubProtocol.handler = { request in
      requests += 1
      XCTAssertEqual(request.url?.path, "/api/score")
      XCTAssertNil(request.url?.query)
      XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer \(setup.token)")
      XCTAssertEqual(request.httpMethod, "POST")
      let body = try self.body(request)
      XCTAssertEqual(body["team"] as? Int, 2)
      XCTAssertEqual(body["delta"] as? Int, 1)
      return (200, Data("{\"ok\":true,\"match\":{\"id\":\"\(self.matchID)\"}}".utf8))
    }
    try await api().submit(.score, context: setup, team: 2, event: "", player: "")
    XCTAssertEqual(requests, 1)
  }

  func testEventUsesExplicitPlayerAndType() async throws {
    StubProtocol.handler = { request in
      XCTAssertEqual(request.url?.path, "/api/events")
      let body = try self.body(request)
      XCTAssertEqual(body["playerId"] as? String, "test-player")
      XCTAssertEqual(body["type"] as? String, "winner")
      return (200, Data("{\"ok\":true,\"match\":{\"id\":\"\(self.matchID)\"}}".utf8))
    }
    try await api().submit(.event, context: context(), team: 1, event: "winner", player: "test-player")
  }

  func testRedirectDelegateRefusesToForwardCredentials() {
    let request = URLRequest(url: URL(string: "https://other.example")!)
    let response = HTTPURLResponse(url: URL(string: "https://test.example")!, statusCode: 307,
      httpVersion: nil, headerFields: nil)!
    var called = false
    NoProbeRedirects().urlSession(.shared, task: URLSession.shared.dataTask(with: request),
      willPerformHTTPRedirection: response, newRequest: request) { redirected in
      called = true
      XCTAssertNil(redirected)
    }
    XCTAssertTrue(called)
  }

  func testTimeoutDoesNotRetryAndPersistedAttemptRemainsUnknown() async throws {
    let setup = try context()
    var ledger = ProbeLedger()
    try ledger.reserve(.event, context: setup)
    var requests = 0
    StubProtocol.handler = { _ in requests += 1; throw URLError(.timedOut) }
    do {
      try await api().submit(.event, context: setup, team: 1, event: "winner", player: "test-player")
      XCTFail("Must report ambiguous failure")
    } catch {}
    XCTAssertEqual(requests, 1)
    XCTAssertEqual(ledger.outcome(.event, context: setup), .unknown)
    XCTAssertThrowsError(try ledger.reserve(.event, context: setup))
  }

  func testUnexpectedMutationResponseIsNotConfirmed() async throws {
    StubProtocol.handler = { _ in (200, Data("{\"ok\":true,\"match\":{\"id\":\"different\"}}".utf8)) }
    do {
      try await api().submit(.score, context: context(), team: 1, event: "", player: "")
      XCTFail("Must not confirm a different match")
    } catch ProbeError.invalidResponse {} catch { XCTFail("Unexpected error") }
  }
}
