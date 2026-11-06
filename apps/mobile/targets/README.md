`watch/` owns the MAR-44 SwiftUI companion and its single-action HTTPS probe.
Pinned `@bacons/apple-targets` generates its Xcode target outside this directory.
`watch/Shared` is compiled by both the Watch target and the phone's app-root
`WatchSpike.podspec`; keep protocol, HTTPS and Keychain behavior in one place.

See [WATCH-SPIKE.md](../WATCH-SPIKE.md) for setup, ownership, build commands,
and [WATCH-VALIDATION.md](../WATCH-VALIDATION.md) for the verified physical run
and remaining acceptance criteria.
