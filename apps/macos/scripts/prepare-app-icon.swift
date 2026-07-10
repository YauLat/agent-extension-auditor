#!/usr/bin/env swift

import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

guard CommandLine.arguments.count == 3 else {
    FileHandle.standardError.write(Data("Usage: prepare-app-icon.swift <input.png> <output.png>\n".utf8))
    exit(2)
}

let inputURL = URL(fileURLWithPath: CommandLine.arguments[1])
let outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
let canvasSize = 1_024
let canvasRect = CGRect(x: 0, y: 0, width: canvasSize, height: canvasSize)

guard let source = CGImageSourceCreateWithURL(inputURL as CFURL, nil),
      let sourceImage = CGImageSourceCreateImageAtIndex(source, 0, nil),
      let context = CGContext(
          data: nil,
          width: canvasSize,
          height: canvasSize,
          bitsPerComponent: 8,
          bytesPerRow: 0,
          space: CGColorSpaceCreateDeviceRGB(),
          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
      ) else {
    FileHandle.standardError.write(Data("Unable to read or prepare icon artwork.\n".utf8))
    exit(1)
}

context.clear(canvasRect)
context.addPath(CGPath(
    roundedRect: canvasRect,
    cornerWidth: 196,
    cornerHeight: 196,
    transform: nil
))
context.clip()
context.interpolationQuality = .high
context.draw(sourceImage, in: canvasRect)

guard let maskedImage = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(
          outputURL as CFURL,
          UTType.png.identifier as CFString,
          1,
          nil
      ) else {
    FileHandle.standardError.write(Data("Unable to create masked icon.\n".utf8))
    exit(1)
}

CGImageDestinationAddImage(destination, maskedImage, nil)
guard CGImageDestinationFinalize(destination) else {
    FileHandle.standardError.write(Data("Unable to write masked icon.\n".utf8))
    exit(1)
}
