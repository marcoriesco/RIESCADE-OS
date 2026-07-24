import * as fs from 'fs'

// CRC32 table
const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  }
  crcTable[i] = c
}

export function calculateBufferCRC32(buf: Buffer): string {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0').toUpperCase()
}

export function calculateFileCRC32(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath)
    let crc = 0xffffffff

    stream.on('data', (chunk: string | Buffer) => {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      for (let i = 0; i < buffer.length; i++) {
        crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
      }
    })

    stream.on('end', () => {
      const finalCrc = ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0').toUpperCase()
      resolve(finalCrc)
    })

    stream.on('error', (err) => {
      reject(err)
    })
  })
}

// Fast ZIP file CRC32 extractor (reads directly from the central directory)
export function getZipContentCRC32(filePath: string): string | null {
  let fd: number | null = null
  try {
    fd = fs.openSync(filePath, 'r')
    const stats = fs.fstatSync(fd)
    const fileSize = stats.size

    if (fileSize < 22) return null // Minimum ZIP size is 22 bytes (empty ZIP EOCD)

    // Read the last 1024 bytes (or the whole file if it's smaller) to locate EOCD
    const readLength = Math.min(1024, fileSize)
    const buffer = Buffer.alloc(readLength)
    fs.readSync(fd, buffer, 0, readLength, fileSize - readLength)

    // Locate End of Central Directory signature: 0x06054b50 (PK\5\6)
    let eocdOffset = -1
    for (let i = readLength - 22; i >= 0; i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = fileSize - readLength + i
        break
      }
    }

    if (eocdOffset === -1) return null

    // Read EOCD fields
    const eocdBuffer = Buffer.alloc(22)
    fs.readSync(fd, eocdBuffer, 0, 22, eocdOffset)

    const cdSize = eocdBuffer.readUInt32LE(12)
    const cdOffset = eocdBuffer.readUInt32LE(16)

    // Read Central Directory
    const cdBuffer = Buffer.alloc(cdSize)
    fs.readSync(fd, cdBuffer, 0, cdSize, cdOffset)

    let offset = 0
    const files: { name: string; crc: string; size: number }[] = []

    while (offset < cdSize) {
      if (offset + 46 > cdSize) break
      const sig = cdBuffer.readUInt32LE(offset)
      if (sig !== 0x02014b50) break // Central Directory File Header signature (PK\1\2)

      const crc32 = cdBuffer.readUInt32LE(offset + 16)
      const uncompressedSize = cdBuffer.readUInt32LE(offset + 24)
      const fileNameLen = cdBuffer.readUInt16LE(offset + 28)
      const extraFieldLen = cdBuffer.readUInt16LE(offset + 30)
      const fileCommentLen = cdBuffer.readUInt16LE(offset + 32)

      if (offset + 46 + fileNameLen > cdSize) break
      const fileName = cdBuffer.toString('utf8', offset + 46, offset + 46 + fileNameLen)

      const crcHex = crc32.toString(16).padStart(8, '0').toUpperCase()
      files.push({ name: fileName, crc: crcHex, size: uncompressedSize })

      offset += 46 + fileNameLen + extraFieldLen + fileCommentLen
    }

    if (files.length === 0) return null

    // Try to find the first file with a typical ROM extension
    const romExtensions = ['.nes', '.sfc', '.smc', '.bin', '.gb', '.gbc', '.gba', '.md', '.gen', '.sms', '.gg', '.rom']
    const matchedRom = files.find(f => {
      const lower = f.name.toLowerCase()
      return romExtensions.some(ext => lower.endsWith(ext))
    })

    if (matchedRom) {
      return matchedRom.crc
    }

    // Fall back to the largest file inside the ZIP (common for arcade games containing multiple files)
    const largestFile = files.reduce((prev, current) => (prev.size > current.size) ? prev : current, files[0])
    return largestFile.crc
  } catch (e) {
    console.error('Failed to parse ZIP header:', e)
    return null
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd)
      } catch {}
    }
  }
}

// Max file size for full CRC32 hashing (200MB). Larger files (ISOs, CHDs) are skipped.
const MAX_HASH_FILE_SIZE = 200 * 1024 * 1024

// Helper to get CRC32 of a ROM (handles on-demand checks)
export async function getRomCRC32(filePath: string): Promise<string> {
  // ZIP files use fast central directory parsing (microseconds) regardless of size
  if (filePath.toLowerCase().endsWith('.zip')) {
    const zipCrc = getZipContentCRC32(filePath)
    if (zipCrc !== null) {
      return zipCrc
    }
  }

  // For non-ZIP files, check file size to avoid hashing multi-GB ISOs/CHDs
  try {
    const stats = fs.statSync(filePath)
    if (stats.size > MAX_HASH_FILE_SIZE) {
      console.log(`[CRC32] Skipping large file (${(stats.size / 1024 / 1024).toFixed(0)}MB): ${filePath}`)
      return '00000000'
    }
  } catch {
    return '00000000'
  }

  // Standard file hashing for smaller ROMs
  return calculateFileCRC32(filePath)
}
