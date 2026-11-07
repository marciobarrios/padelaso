import Foundation
import XCTest

final class NativeContractFixtureTests: XCTestCase {
  func testPortableSnapshotScoresAndStatistics() throws {
    let root = URL(fileURLWithPath: #filePath)
      .deletingLastPathComponent().deletingLastPathComponent()
      .deletingLastPathComponent().deletingLastPathComponent()
    let data = try Data(contentsOf: root.appendingPathComponent("packages/data/fixtures/snapshot.json"))
    struct Score: Decodable { let id: String; let team1Score: Int; let team2Score: Int }
    struct Player: Decodable { let id: String; let name: String; let emoji: String }
    struct Snapshot: Decodable {
      let version: Int; let matchId: String; let sessionId: String; let revision: Int
      let authorizationExpiresAt: String?; let courtNumber: Int?
      let roster: [Player]; let sets: [Score]; let activeSetId: String?
    }
    let snapshot = try JSONDecoder().decode(Snapshot.self, from: data)
    XCTAssertEqual(snapshot.version, 1)
    XCTAssertEqual(snapshot.matchId, "match-a")
    XCTAssertEqual(snapshot.roster.first?.emoji, "🎾")
    XCTAssertNil(snapshot.authorizationExpiresAt)
    XCTAssertNil(snapshot.courtNumber)
    XCTAssertEqual(snapshot.sets.filter { $0.team1Score > $0.team2Score }.count, 1)
    XCTAssertEqual(snapshot.sets.filter { $0.team2Score > $0.team1Score }.count, 1)
    XCTAssertEqual(snapshot.sets.last?.id, snapshot.activeSetId)
    XCTAssertEqual((snapshot.sets.last?.team1Score ?? 0) + 1, 3)
  }
}
