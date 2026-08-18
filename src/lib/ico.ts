/**
 * Builds a .ico container from pre-rendered PNG blobs (PNG-in-ICO is valid
 * for every modern consumer). Layout: 6-byte ICONDIR, then one 16-byte
 * ICONDIRENTRY per image, then the concatenated PNG payloads.
 */
export function encodeIco(
  images: { size: number; png: Uint8Array }[],
): Uint8Array {
  const headerLength = 6
  const entryLength = 16
  const dataOffset = headerLength + entryLength * images.length
  const totalLength =
    dataOffset + images.reduce((sum, image) => sum + image.png.length, 0)

  const out = new Uint8Array(totalLength)
  const view = new DataView(out.buffer)

  view.setUint16(0, 0, true)
  view.setUint16(2, 1, true)
  view.setUint16(4, images.length, true)

  let offset = dataOffset
  images.forEach((image, index) => {
    const entry = headerLength + index * entryLength
    // Width/height bytes: 0 encodes 256.
    out[entry] = image.size >= 256 ? 0 : image.size
    out[entry + 1] = image.size >= 256 ? 0 : image.size
    out[entry + 2] = 0
    out[entry + 3] = 0
    view.setUint16(entry + 4, 1, true)
    view.setUint16(entry + 6, 32, true)
    view.setUint32(entry + 8, image.png.length, true)
    view.setUint32(entry + 12, offset, true)

    out.set(image.png, offset)
    offset += image.png.length
  })

  return out
}
