# audiotagr

Read and write audio file tags from Node with one format-agnostic API, plus a streaming folder scanner.

Under the hood it reads and writes with [`music-metadata`](https://github.com/borewit/music-metadata), and papers over the differences between ID3v2.4, Vorbis comments and iTunes/MP4 atoms — including the ones that silently corrupt a round-trip if you use the convenience setters directly.

```bash
npm install audiotagr
```

Requires Node 22+. ESM only.

## Reading

```ts
import { readAudioMetadata } from 'audiotagr'

const meta = await readAudioMetadata('/music/song.flac')

meta.title //=> 'Song'
meta.artist //=> 'A;B'          multi-value fields are joined with ';'
meta.genre //=> 'Pop Punk'      Style never leaks into Genre
meta.style //=> 'acoustic'
meta.rating //=> 80             always 0-100, whatever the format's native scale
meta.customTags //=> [{ key: 'vorbis:MOOD', value: 'calm' }]
meta.pictures //=> [{ type, format, description, data }]
// meta.duration, meta.bitrate, meta.codec, meta.lossless
```

Dates come back as the raw tag string (`originalReleaseDate: '1998-05-04'`) — parse them with whatever your app already uses.

## Writing

Only the fields present in the patch are touched; `null` or `''` clears a tag.

```ts
import { writeAudioMetadata, writeAudioPicture } from 'audiotagr'

await writeAudioMetadata('/music/song.flac', {
  title: 'New Title',
  artist: 'A;B',
  style: 'acoustic',
  bpm: 128,
  rating: 80,
  customTags: [
    { key: 'MOOD', value: 'calm' },
    { key: 'OLD_TAG', value: null }
  ]
})

await writeAudioPicture('/music/song.flac', pngBuffer, 'image/png')
```

Each field is written using the name that format's readers actually look for: `TXXX:STYLE` in ID3v2.4, `STYLE` in Vorbis, and `----:com.apple.iTunes:STYLE` in MP4. Writes are atomic by default: the writer rebuilds the metadata, streams the encoded audio unchanged into a sibling temporary file, and renames it into place.

## Scanning a library

`scanFolder` is an async generator: it walks the tree, reads each file and hands it to you one at a time, so a scan never holds a whole library in memory. Between batches it yields the event loop and forces a GC pass, because embedded cover art lives off-heap and otherwise piles up.

```ts
import { scanFolder } from 'audiotagr'

for await (const item of scanFolder('/music', {
  // Skip files your database already has at this mtime.
  shouldSkip: (filePath, stats) => stats.mtime.getTime() === known.get(filePath)
})) {
  switch (item.kind) {
    case 'song':
      await save(item.metadata)
      break
    case 'skipped':
      break
    case 'error':
      console.warn(item.filePath, item.error)
      break
  }
  reportProgress(item.progress) // { current, total, currentFile }
}
```

Options: `batchSize` (default 100), `shouldSkip`, `shouldSkipDirectory` (leave a subdirectory out of the walk, e.g. `@eaDir`), `onDirectoryError`, `signal`. Unreadable directories are reported and skipped rather than aborting the walk. `scanFolders(paths)` does the same across several roots and tags each item with its `folder`.

## Browser-safe subset

`audiotagr/tags` exports the tag model and the value helpers with no filesystem or parser dependency, so UI code can share them with the server:

```ts
import { isMusicFile, joinMultiValue, splitMultiValue, stripKeyPrefix } from 'audiotagr/tags'
import type { AudioFileMetadata, AudioMetadataPatch } from 'audiotagr/tags'
```

## Supported files

Reading supports `.mp3 .flac .wav .aac .ogg .m4a .m4b .wma .aiff .opus`.

Writing supports:

| Container       | Extensions             | Tag format                                    |
| --------------- | ---------------------- | --------------------------------------------- |
| FLAC            | `.flac`                | Vorbis Comments and native FLAC pictures      |
| Ogg Vorbis/Opus | `.ogg`, `.opus`        | Vorbis Comments and embedded pictures         |
| MP3             | `.mp3`                 | ID3v2.4; creates a tag on untagged MPEG audio |
| WAV             | `.wav`                 | ID3v2.4 in a RIFF/WAVE `id3 ` chunk           |
| MP4/M4A/M4B     | `.m4a`, `.m4b`, `.mp4` | iTunes-style metadata                         |

`.wma`, `.aiff` and raw `.aac` remain readable, but are not writable.

## Notes on round-trips

- **ID3v2.4 output.** ID3v2.2 and ID3v2.3 tags are read and normalized to ID3v2.4 on write. Fields this package models are preserved; frames the reader does not expose, and a trailing ID3v1 tag, are lost when the old tag is replaced.
- **One tag section per file.** The writer writes the canonical tag section for the container (ID3v2.4, Vorbis Comments or iTunes items). Unlike the old TagLib writer, it does not fan a field out to every tag type present or write ASF/APEv2 tags.
- **BPM in Vorbis comments** is written to `BPM`, the field readers surface as BPM.
- **Style vs Genre**: parsers fold STYLE frames into the same field as the genre frame. This package pulls them apart on read and keeps them apart on write.
- **Multi-value fields** are flattened with `;`. MP4 only stores one string per field, so they come back joined with `; `.
- **Rating** is exposed as 0-100 and stored as POPM (1-255) in ID3v2.4 and as a plain number in Vorbis comments. MP4 keeps the iTunes `RATING` freeform item, which most readers do not surface as a common rating.
- **ID3v2.2 `TXX` frames** embed the description in the value; they are normalized to the `TXXX` shape (`ID3v2.2:TXX:MOOD`).
- **Atomic writes** require write access to the file's directory. This is the default for every format. With `atomic: false`, MP3/FLAC/WAV stage in memory, while MP4 and Ogg still use a sibling temporary file and therefore still need directory write access.

## Contributing

```bash
pnpm install
pnpm test        # unit tests + round-trip tests against real audio fixtures
pnpm typecheck
pnpm build
```

The round-trip tests write to copies in a temp dir; `test/fixtures/` is read-only and a guard test fails if any fixture changes.

## License

LGPL-3.0-only. You can use this package in a project under any license; if you modify the package itself, those changes stay under the LGPL. See `LICENSE` (the LGPL terms) and `LICENSE.GPL` (the GPL they build on).

Extracted from [Tagr](https://github.com/suitux/Tagr), a self-hosted music metadata editor, which is AGPL-3.0-only.
