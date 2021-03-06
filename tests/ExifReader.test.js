const ExifReader = require('../src/ExifReader')
const path = require('path')
const fse = require('fs-extra')

describe('ExifReader integration tests', () => {
  const fixtures = path.join(__dirname, './_fixtures/')
  const exifReader = new ExifReader()

  afterAll(() => {
    return exifReader.close()
  })

  test('#_confirmValidTags() expect valid ImageWidth tag in image file', () => {
    const tags = fse.readJsonSync(path.join(fixtures, '/exif/exif_test_iphone_1.json'))
    expect(exifReader._confirmValidTags(tags, ['ImageWidth'])).toEqual(true)
  })

  test('#_confirmValidTags() tag checking allows for multiple OR matches', () => {
    const tags = fse.readJsonSync(path.join(fixtures, '/exif/exif_exifimagewidth_tag.json'))
    expect(exifReader._confirmValidTags(tags, ['ImageWidth', 'ExifImageWidth'])).toEqual(true)
  })

  test('#_confirmValidTags() expect missing ImageWidth tag in non-image file', () => {
    const tags = fse.readJsonSync(path.join(fixtures, '/exif/exif_test_zip.json'))
    expect(exifReader._confirmValidTags(tags, ['ImageWidth'])).toEqual(false)
  })

  // Note the JS Date object has zero-indexed months
  test.each([
    ['exif_test_iphone_1.json', new Date(2017, 10, 9, 16, 27, 22, 0)],
    ['exif_test_iphone_video.json', new Date(2017, 10, 9, 16, 29, 26, 0)],
    ['exif_test_old_video.json', new Date(2005, 4, 14, 23, 42, 21, 0)],
    ['exif_sony_camera_video.json', new Date(2021, 4, 29, 18, 3, 58, 0)],
    ['exif_filemodifydate_fallback.json', new Date(2019, 11, 31, 14, 23, 1, 0)],
    ['exif_invalid_date.json', null]
  ])(
    '#_getDateFromTags() %s, expected date: %s',
    (fileName, expectedDate) => {
      const tags = fse.readJsonSync(path.join(fixtures, '/exif/', fileName))

      expect(exifReader._getDateFromTags(tags)).toEqual(expectedDate)
    }
  )

  test.each([
    [new Date(2017, 10, 9, 16, 29, 26, 0), '2017-11'],
    [new Date(2005, 4, 14, 23, 42, 21, 0), '2005-05'],
    [null, 'Unknown']
  ])(
    '#_getFolderFromDate() %s, expected folder name: %s',
    (date, expectedFolder) => {
      expect(exifReader._getFolderFromDate(date)).toEqual(expectedFolder)
    }
  )

  test.each([
    ['iphone_photo_2.jpg', '2017-11'],
    ['iphone_photo.jpg', '2017-11'],
    ['iphone_video.mov', '2017-11'],
    ['old_video.avi', '2005-05']
  ])(
    '#getDateFolder() from %s, expected folder name: %s',
    (fileName, expectedFolder) => {
      return expect(exifReader.getDateFolder(path.join(fixtures, '/media/', fileName))).resolves.toEqual(expectedFolder)
    }
  )

  test('#getDateFolder() should still work after closing', () => {
    const checkPath = path.join(fixtures, '/media/', 'old_video.avi')
    const expected = '2005-05'

    return expect(exifReader.getDateFolder(checkPath)).resolves.toEqual(expected)
      .then(() => {
        return exifReader.close()
      })
      .then(() => {
        return expect(exifReader.getDateFolder(checkPath)).resolves.toEqual(expected)
      })
      .then(() => {
        return exifReader.close()
      })
  }, 4000)
})
