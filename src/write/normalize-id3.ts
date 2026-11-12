import type { Picture, TagPatch } from 'music-metadata'
import { TagPicture } from '../shared/domain'
import { AudioFileMetadata, AudioMetadataPatch } from '../tags/domain'
import { buildWriterPatch } from './to-writer-patch'
import { WriteTarget } from './write-target'

/**
 * Build a complete writer patch for a legacy ID3v2.2/2.3 tag.
 *
 * The writer can only write ID3v2.4. Before replacing the old tag we read it
 * through `music-metadata` and merge every field this package models, so a small
 * patch (for example only the title) does not wipe the rest of the tag.
 *
 * Frames that `music-metadata` does not expose, and a trailing ID3v1 tag, are
 * still lost when the old ID3v2 tag is replaced.
 */
export function buildNormalizedId3Patch(
  metadata: AudioFileMetadata,
  patch: AudioMetadataPatch,
  target: WriteTarget
): TagPatch {
  const existing = buildWriterPatch(metadataToPatch(metadata), target)
  const requested = buildWriterPatch(patch, target)
  const merged = mergeTagPatches(existing, requested)

  const pictures = toWriterPictures(metadata.pictures)
  if (pictures.length > 0) {
    merged.picture = pictures
  }

  return merged
}

function metadataToPatch(meta: AudioFileMetadata): AudioMetadataPatch {
  return {
    title: meta.title,
    artist: meta.artist,
    sortArtist: meta.sortArtist,
    album: meta.album,
    sortAlbum: meta.sortAlbum,
    trackNumber: meta.trackNumber,
    trackTotal: meta.trackTotal,
    discNumber: meta.discNumber,
    discTotal: meta.discTotal,
    year: meta.year,
    bpm: meta.bpm,
    genre: meta.genre,
    style: meta.style,
    albumArtist: meta.albumArtist,
    sortAlbumArtist: meta.sortAlbumArtist,
    composer: meta.composer,
    conductor: meta.conductor,
    comment: meta.comment,
    grouping: meta.grouping,
    publisher: meta.publisher,
    catalogNumber: meta.catalogNumber,
    releaseType: meta.releaseType,
    lyricist: meta.lyricist,
    barcode: meta.barcode,
    work: meta.work,
    originalReleaseDate: meta.originalReleaseDate,
    copyright: meta.copyright,
    rating: meta.rating,
    lyrics: meta.lyrics,
    compilation: meta.compilation,
    customTags: meta.customTags
  }
}

/** Merge writer patches with the requested fields taking precedence. */
function mergeTagPatches(base: TagPatch, override: TagPatch): TagPatch {
  const result: TagPatch = { ...base }

  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue

    if (key === 'native') {
      result.native = { ...(base.native ?? {}), ...(value as NonNullable<TagPatch['native']>) }
    } else {
      ;(result as Record<string, unknown>)[key] = value
    }
  }

  return result
}

function toWriterPictures(pictures: TagPicture[]): Picture[] {
  return pictures.flatMap(picture => {
    if (!picture.data || !picture.format) return []

    return [
      {
        type: picture.type ?? undefined,
        format: picture.format,
        description: picture.description ?? '',
        data: picture.data
      }
    ]
  })
}
