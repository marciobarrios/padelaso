// Run from apps/mobile: swift scripts/generate-app-icon.swift
import AppKit

let size = NSSize(width: 1024, height: 1024)
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: 1024, pixelsHigh: 1024,
  bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false, isPlanar: false,
  colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor(srgbRed: 18/255, green: 20/255, blue: 16/255, alpha: 1).setFill()
NSBezierPath(rect: NSRect(origin: .zero, size: size)).fill()
NSColor(srgbRed: 207/255, green: 239/255, blue: 103/255, alpha: 1).setFill()
NSBezierPath(ovalIn: NSRect(x: 222, y: 222, width: 580, height: 580)).fill()
NSColor(srgbRed: 18/255, green: 20/255, blue: 16/255, alpha: 1).setStroke()
for mirrored in [false, true] {
  let path = NSBezierPath()
  path.lineWidth = 24
  path.move(to: NSPoint(x: mirrored ? 717 : 307, y: 307))
  path.curve(to: NSPoint(x: mirrored ? 717 : 307, y: 717),
    controlPoint1: NSPoint(x: mirrored ? 437 : 587, y: 380),
    controlPoint2: NSPoint(x: mirrored ? 437 : 587, y: 644))
  path.stroke()
}
NSGraphicsContext.restoreGraphicsState()
let png = bitmap.representation(using: .png, properties: [:])!
try png.write(to: URL(fileURLWithPath: "assets/app-icon.png"))
