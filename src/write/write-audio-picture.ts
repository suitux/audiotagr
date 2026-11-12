import { UnsupportedFormatError, updateFile } from 'music-metadata'
import { readAudioMetadata } from '../read/read-audio-metadata'
import { MetadataWriteError } from '../shared/errors'
import { buildNormalizedId3Patch } from './normalize-id3'
import { detectWriteTarget, hasLegacyId3Tag } from './write-target'

/**
 * Replace every embedded picture with a single front cover.
 *
 * ID3v2.2/2.3 files are normalized to ID3v2.4 first, preserving the fields this
 * package models.
 *
 * @throws {MetadataWriteError} when the file cannot be opened, is not a
 * supported writable format, or cannot be saved.
 */
export async function writeAudioPicture(filePath: string, image: Buffer, mimeType: string): Promise<void> {
  try {
    const target = await detectWriteTarget(filePath)
    if (target === 'unsupported') {
      throw new UnsupportedFormatError(
        'Unsupported writable format; supported formats are FLAC, Ogg Vorbis/Opus, WAV, MP4 and MP3 with ID3v2.4'
      )
    }

    const picture = {
      type: 'Cover (front)',
      format: mimeType,
      description: '',
      data: image
    }

    if (await hasLegacyId3Tag(filePath, target)) {
      const metadata = await readAudioMetadata(filePath)
      const patch = buildNormalizedId3Patch(metadata, {}, target)
      patch.picture = [picture]
      await updateFile(filePath, patch, { replaceId3: true })
      return
    }

    await updateFile(filePath, { picture: [picture] })
  } catch (error) {
    throw new MetadataWriteError(filePath, { cause: error })
  }
}
