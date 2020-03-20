const EventListener = require('events')
const path = require('path')
const fse = require('fs-extra')
const Logger = require('./Logger')
const md5File = require('md5-file')

class FileCopier extends EventListener {
  constructor () {
    super()

    this._fileQueue = []
    this._duplicatesDir = ''
    this._queueActive = false
  }

  set duplicatesDir (dirPath) {
    fse.mkdirpSync(dirPath)
    this._duplicatesDir = dirPath
  }

  get duplicatesDir () {
    return this._duplicatesDir
  }

  /**
   * Formats a file queue item, adding the target path
   * Optionally will update the item in-place instead of appending
   * @param {string} source
   * @param {string} destination
   * @param {boolean} moveFile
   * @param {boolean} preserveDuplicate
   * @param {object} updateInPlace
   * @returns {object}
   */
  addToQueue (
    source,
    destination,
    moveFile = false,
    preserveDuplicate = false,
    updateInPlace = null
  ) {
    // If destination is a folder, append a file name
    // This is mostly to keep all the logic in processing the same
    // and always expect a file in the destination
    const sourceDetails = path.parse(source)
    const destDetails = path.parse(destination)

    // No extension, assume a dir
    if (destDetails.ext === '') {
      destination = path.join(destination, sourceDetails.base)
    }

    const item = {
      source,
      destination,
      moveFile,
      preserveDuplicate
    }

    if (updateInPlace) {
      Object.assign(updateInPlace, item)
    } else {
      this._fileQueue.push(item)
    }

    if (!this._queueActive) this._continueQueue()

    return item
  }

  /**
   * Starts or steps through queue
   */
  async _continueQueue () {
    this._queueActive = true

    if (this._fileQueue.length > 0) {
      const success = await this._processQueueItem(this._fileQueue[0])
      if (success) this._fileQueue.shift()
    }

    if (this._fileQueue.length === 0) {
      this._onQueueEmptied()
    } else {
      process.nextTick(() => this._continueQueue())
    }
  }

  /**
   * All done
   */
  _onQueueEmptied () {
    this._queueActive = false
    this.emit(FileCopier.EVENT_QUEUE_COMPLETE)
  }

  /**
   * Processes a single queued file item
   * @param {object} queueItem
   */
  async _processQueueItem (queueItem) {
    Logger.info(`Processing ${queueItem.source} -> ${queueItem.destination}`, 'FileCopier')

    let processSuccess = false

    try {
      // Either perform a move or copy
      // Copy would be used to go from an SD card
      if (queueItem.moveFile) {
        await fse.move(queueItem.source, queueItem.destination, {
          overwrite: false
        })
      } else {
        await fse.copy(queueItem.source, queueItem.destination, {
          overwrite: false,
          errorOnExist: true,
          preserveTimestamps: true
        })
      }

      processSuccess = true
    } catch (error) {
      if (error.message.match(/already exists/)) {
        // Verify that the destination is truly a dupe
        if (queueItem.preserveDuplicate) {
          // These are the same hash, move to dupes folder
          // and overwrite any existing dupes
          if (this._compareFiles(queueItem.source, queueItem.destination)) {
            this.addToQueue(
              queueItem.source,
              this._duplicatesDir,
              queueItem.moveFile,
              false,
              queueItem
            )
          } else {
            // Files were different hashes, but same filename. Increment filename.
            const newDestination = this._incrementFilename(queueItem.destination)
            this.addToQueue(
              queueItem.source,
              newDestination,
              queueItem.moveFile,
              queueItem.preserveDuplicate,
              queueItem
            )
          }
          processSuccess = false
        }
      } else {
        // Unrecoverable error, throw it and advance the queue
        // fileQueue.shift()
        // TODO - proper logger
        Logger.error('Could not copy file', 'FileCopier', error)
        processSuccess = true
        // this.emit(FileCopier.EVENT_QUEUE_ITEM_PROCESSED)
        // return false
        // throw error
      }
    }

    this.emit(FileCopier.EVENT_QUEUE_ITEM_PROCESSED, processSuccess)
    return processSuccess
  }

  _compareFiles (fileA, fileB) {
    return md5File.sync(fileA) === md5File.sync(fileB)
  }

  _incrementFilename (filePath) {
    const parts = path.parse(filePath)
    // See if the file name before the extension contains _xxxx
    const versionMatch = parts.name.match(/(.*)_([0-9]{2}$)/)

    let base = parts.name
    let nextVersion = 0

    if (versionMatch) {
      base = versionMatch[1]
      nextVersion = parseInt(versionMatch[2] + 1)
    }

    // Create a new name like image_01
    parts.name = `${base}_${String(nextVersion).padStart(2, '0')}`
    parts.base = null

    // Reconstitute the file
    return path.format(parts)
  }
}

FileCopier.EVENT_QUEUE_COMPLETE = 'queue_complete'
FileCopier.EVENT_QUEUE_ITEM_PROCESSED = 'queue_item_processed'

module.exports = FileCopier