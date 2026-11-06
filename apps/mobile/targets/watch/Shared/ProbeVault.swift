import Foundation
import Security

// Separate device-local Keychain items for setup and the single-action ledger.
// AfterFirstUnlock permits reads after locking, without cloud/keychain syncing.
enum ProbeVault {
  private static func query(_ account: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword,
     kSecAttrService as String: "com.padelaso.watch-spike.v1",
     kSecAttrAccount as String: account]
  }

  static func read<T: Decodable>(_ account: String, as type: T.Type) throws -> T? {
    var request = query(account)
    request[kSecReturnData as String] = true
    request[kSecMatchLimit as String] = kSecMatchLimitOne
    var item: CFTypeRef?
    let status = SecItemCopyMatching(request as CFDictionary, &item)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = item as? Data else { throw ProbeError.storage }
    return try JSONDecoder().decode(type, from: data)
  }

  static func write<T: Encodable>(_ account: String, value: T) throws {
    let attributes: [String: Any] = [
      kSecValueData as String: try JSONEncoder().encode(value),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    let status = SecItemUpdate(query(account) as CFDictionary, attributes as CFDictionary)
    if status == errSecItemNotFound {
      guard SecItemAdd(query(account).merging(attributes, uniquingKeysWith: { _, new in new })
        as CFDictionary, nil) == errSecSuccess else { throw ProbeError.storage }
    } else if status != errSecSuccess { throw ProbeError.storage }
  }

  static func remove(_ account: String) throws {
    let status = SecItemDelete(query(account) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else { throw ProbeError.storage }
  }
}
