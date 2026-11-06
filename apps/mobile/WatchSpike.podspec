Pod::Spec.new do |s|
  s.name = 'WatchSpike'
  s.version = '0.1.0'
  s.summary = 'MAR-44 native Watch setup'
  s.description = 'Test-only native provisioning for the Padelaso Watch feasibility gate.'
  s.license = { :type => 'MIT' }
  s.author = 'Padelaso'
  s.homepage = 'https://github.com/marciobarrios/padelaso'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'SwiftUI', 'WatchConnectivity', 'Security'
  s.swift_version = '5.0'
  # App-root podspec keeps shared files within the CocoaPods source boundary.
  s.source_files = 'modules/watch-spike/ios/**/*.swift', 'targets/watch/Shared/*.swift'
end
