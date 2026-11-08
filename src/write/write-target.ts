import fs from 'fs/promises'
import path from 'path'

/**
 * The tag family a file needs, which decides how common fields and custom tags
 * are mapped onto `music-metadata`'s native patch keys.
 */
export type WriteTarget = 'id3' | 'vorbis' | 'mp4' | 'unsupported'

const EXTENSION_TARGETS: Record<string, WriteTarget> = {
  '.mp3': 'id3',
  '.wav': 'id3',
  '.flac': 'vorbis',
  '.ogg': 'vorbis',
  '.oga': 'vorbis',
  '.opus': 'vorbis',
  '.m4a': 'mp4',
  '.m4b': 'mp4',
  '.mp4': 'mp4'
}

/**
 * Detect the tag family from the file signature, falling back to the extension.
 *
 * Signatures win so a mislabelled file still gets the right native tag names;
 * the writer repeats the same detection before it writes.
 */
export async function detectWriteTarget(filePath: string): Promise<WriteTarget> {
  const header = await readAt(filePath, 0, 12)
  const signature = ascii(header, 0, Math.min(4, header.length))

  if (signature === 'OggS') return 'vorbis'
  if (signature === 'fLaC') return 'vorbis'
  if (signature === 'RIFF' && ascii(header, 8, 12) === 'WAVE') return 'id3'
  if (ascii(header, 4, 8) === 'ftyp') return 'mp4'

  if (ascii(header, 0, 3) === 'ID3') {
    // A nonstandard leading ID3 tag in front of FLAC is still a Vorbis comment
    // file for native-key mapping.
    const tagEnd = id3TagEnd(header)
    if (tagEnd !== null && ascii(await readAt(filePath, tagEnd, 4), 0, 4) === 'fLaC') return 'vorbis'
    return 'id3'
  }

  return EXTENSION_TARGETS[path.extname(filePath).toLowerCase()] ?? 'unsupported'
}

async function readAt(filePath: string, offset: number, length: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buffer, 0, length, offset)
    return buffer.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}

function ascii(buffer: Buffer, start: number, end: number): string {
  return buffer.subarray(start, end).toString('latin1')
}

/** Offset of the first byte after the leading ID3v2 tag. */
function id3TagEnd(header: Buffer): number | null {
  if (header.length < 10) return null

  const size =
    ((header[6]! & 0x7f) << 21) | ((header[7]! & 0x7f) << 14) | ((header[8]! & 0x7f) << 7) | (header[9]! & 0x7f)
  const footer = header[3] === 4 && (header[5]! & 0x10) !== 0 ? 10 : 0
  return 10 + size + footer
}

/**
 * True when the file carries an ID3v2.2 or ID3v2.3 tag. The writer only writes
 * ID3v2.4, so these tags need to be read and merged before replacing them.
 */
export async function hasLegacyId3Tag(filePath: string, target: WriteTarget): Promise<boolean> {
  if (target !== 'id3') return false

  const header = await readAt(filePath, 0, 12)
  if (ascii(header, 0, 3) === 'ID3') return isLegacyVersion(header[3])

  if (ascii(header, 0, 4) === 'RIFF' && ascii(header, 8, 12) === 'WAVE') {
    return hasLegacyWavId3Tag(filePath, header)
  }

  return false
}

function isLegacyVersion(version: number | undefined): boolean {
  return version === 2 || version === 3
}

async function hasLegacyWavId3Tag(filePath: string, header: Buffer): Promise<boolean> {
  const end = header.readUInt32LE(4) + 8
  let offset = 12

  while (offset + 8 <= end) {
    const chunk = await readAt(filePath, offset, 8)
    if (chunk.length < 8) return false

    const id = ascii(chunk, 0, 4)
    const size = chunk.readUInt32LE(4)
    if (id === 'id3 ' || id === 'ID3 ') {
      const tag = await readAt(filePath, offset + 8, 4)
      return ascii(tag, 0, 3) === 'ID3' && isLegacyVersion(tag[3])
    }

    offset += 8 + size + (size % 2)
  }

  return false
}
