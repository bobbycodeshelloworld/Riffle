// Renders the Riffle app icon: three fanned "riffling" pages with
// syntax-highlight stripes on a Catppuccin Mocha squircle. 1024x1024 PNG.
import AppKit

func hex(_ v: UInt32, _ a: CGFloat = 1) -> NSColor {
    NSColor(srgbRed: CGFloat((v >> 16) & 0xff) / 255,
            green: CGFloat((v >> 8) & 0xff) / 255,
            blue: CGFloat(v & 0xff) / 255, alpha: a)
}

let size: CGFloat = 1024
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size),
                           bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                           colorSpaceName: .calibratedRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let gctx = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.current = gctx
let ctx = gctx.cgContext

// ── Squircle plate (Big Sur grid: ~824pt content, soft ambient shadow) ──
let plate = CGRect(x: 100, y: 108, width: 824, height: 824)
let squircle = CGPath(roundedRect: plate, cornerWidth: 185, cornerHeight: 185, transform: nil)
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -14), blur: 34,
              color: NSColor.black.withAlphaComponent(0.35).cgColor)
ctx.addPath(squircle)
ctx.setFillColor(hex(0x1e1e2e).cgColor)
ctx.fillPath()
ctx.restoreGState()

// Subtle top-to-bottom gradient inside the plate; keep clip for the pages
ctx.saveGState()
ctx.addPath(squircle)
ctx.clip()
let grad = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(),
                      colors: [hex(0x2a2a44).cgColor, hex(0x16161f).cgColor] as CFArray,
                      locations: [0, 1])!
ctx.drawLinearGradient(grad, start: CGPoint(x: 512, y: 932), end: CGPoint(x: 512, y: 108), options: [])

// ── Three fanned pages, pivoting near the icon center ──
struct Page { let rot: CGFloat; let fill: NSColor; let front: Bool }
let pages = [
    Page(rot: 24, fill: hex(0xcba6f7), front: false),   // purple, back
    Page(rot: 12, fill: hex(0xa6e3a1), front: false),   // green, middle
    Page(rot: 0,  fill: hex(0xf7f1e3), front: true),    // cream paper, front
]
let pageRect = CGRect(x: -205, y: -275, width: 410, height: 550)
let pagePath = CGPath(roundedRect: pageRect, cornerWidth: 42, cornerHeight: 42, transform: nil)

// stripe rows: (y, x-offset, width, color) — reads like highlighted code
let stripes: [(CGFloat, CGFloat, CGFloat, UInt32)] = [
    (188, -150, 180, 0x7f849c),  // comment gray
    (112, -150, 250, 0xcba6f7),  // keyword purple
    (36,  -110, 210, 0x89b4fa),  // function blue
    (-40, -110, 250, 0xa6e3a1),  // string green
    (-116, -150, 150, 0xfab387), // number orange
    (-192, -150, 220, 0xf38ba8), // red
]

for p in pages {
    ctx.saveGState()
    ctx.translateBy(x: 512, y: 496)
    ctx.rotate(by: p.rot * .pi / 180)
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -10), blur: 26,
                  color: NSColor.black.withAlphaComponent(0.38).cgColor)
    ctx.addPath(pagePath)
    ctx.setFillColor(p.fill.cgColor)
    ctx.fillPath()
    ctx.restoreGState()
    if p.front {
        for (y, x, w, c) in stripes {
            let bar = CGRect(x: x, y: y - 19, width: w, height: 38)
            ctx.addPath(CGPath(roundedRect: bar, cornerWidth: 19, cornerHeight: 19, transform: nil))
            ctx.setFillColor(hex(c).cgColor)
            ctx.fillPath()
        }
    }
    ctx.restoreGState()
}
ctx.restoreGState() // squircle clip off

NSGraphicsContext.restoreGraphicsState()
let png = rep.representation(using: .png, properties: [:])!
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon.png"
try! png.write(to: URL(fileURLWithPath: out))
print("wrote \(out) (\(png.count) bytes)")
