// stewardos-ocr — reads a document on the hub and prints its text, page by page, as JSON.
// PDFs: the embedded text when a page has some; otherwise the page is rendered and read with Apple's
// on-device Vision recognizer. Images: Vision directly. Nothing leaves the machine. Never writes to the file.
//
// Build (once):  swiftc -O -o scripts/ocr/stewardos-ocr scripts/ocr/stewardos-ocr.swift
// Use:           scripts/ocr/stewardos-ocr <file>   →   {"pages":[{"n":1,"text":"…","confidence":0.97,"source":"vision"}]}
import Foundation
import Vision
import PDFKit
import AppKit

struct Page: Codable { let n: Int; let text: String; let confidence: Double; let source: String }
struct Out: Codable { let pages: [Page]; let error: String? }

func emit(_ o: Out) {
    let enc = JSONEncoder(); enc.outputFormatting = []
    if let d = try? enc.encode(o), let s = String(data: d, encoding: .utf8) { print(s) }
    exit(o.error == nil ? 0 : 1)
}

func recognize(_ cg: CGImage) -> (String, Double) {
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = true
    req.recognitionLanguages = ["en-US"]
    let handler = VNImageRequestHandler(cgImage: cg, options: [:])
    do { try handler.perform([req]) } catch { return ("", 0) }
    var lines: [String] = []; var conf: [Double] = []
    for obs in req.results ?? [] {
        guard let top = obs.topCandidates(1).first else { continue }
        lines.append(top.string); conf.append(Double(top.confidence))
    }
    let avg = conf.isEmpty ? 0 : conf.reduce(0, +) / Double(conf.count)
    return (lines.joined(separator: "\n"), avg)
}

func render(_ page: PDFPage, dpi: CGFloat = 200) -> CGImage? {
    let bounds = page.bounds(for: .mediaBox)
    let scale = dpi / 72.0
    let w = Int(bounds.width * scale), h = Int(bounds.height * scale)
    guard w > 0, h > 0, w * h < 40_000_000 else { return nil }
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    ctx.setFillColor(CGColor.white); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
    ctx.scaleBy(x: scale, y: scale)
    ctx.translateBy(x: -bounds.origin.x, y: -bounds.origin.y)
    page.draw(with: .mediaBox, to: ctx)
    return ctx.makeImage()
}

let args = CommandLine.arguments
guard args.count >= 2 else { emit(Out(pages: [], error: "usage: stewardos-ocr <file>")); fatalError() }
let url = URL(fileURLWithPath: args[1])
let ext = url.pathExtension.lowercased()
var pages: [Page] = []

if ext == "pdf" {
    guard let doc = PDFDocument(url: url) else { emit(Out(pages: [], error: "cannot open pdf")); fatalError() }
    if doc.isLocked { emit(Out(pages: [], error: "pdf is password-protected")); fatalError() }
    let count = min(doc.pageCount, 400)
    for i in 0..<count {
        guard let p = doc.page(at: i) else { continue }
        let embedded = (p.string ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        // A page with real text keeps it; a scan (no text, or a few stray characters) is read by Vision.
        if embedded.count >= 40 {
            pages.append(Page(n: i + 1, text: embedded, confidence: 1.0, source: "pdf-text"))
        } else if let cg = render(p) {
            let (t, c) = recognize(cg)
            pages.append(Page(n: i + 1, text: t, confidence: c, source: "vision"))
        } else {
            pages.append(Page(n: i + 1, text: embedded, confidence: 0, source: "unreadable"))
        }
    }
} else {
    guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { emit(Out(pages: [], error: "cannot open image")); fatalError() }
    let (t, c) = recognize(cg)
    pages.append(Page(n: 1, text: t, confidence: c, source: "vision"))
}
emit(Out(pages: pages, error: nil))
