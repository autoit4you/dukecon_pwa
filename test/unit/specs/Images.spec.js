import moxios from 'moxios'
import Images from '../../../src/Images'

describe('Images.js', () => {
  beforeEach(function () {
    moxios.install()
  })

  afterEach(function () {
    moxios.uninstall()
  })

  it('should load image data asynchronously', done => {
    // given ....
    // ... an empty conference image
    const images = Images.getImages()
    expect(images.conferenceImage).to.equal(images.defaultImage)

    // when ...
    // ... initialized
    moxios.wait(function () {
      let request = moxios.requests.mostRecent()
      expect(request.url).to.equal('rest/image-resources.json')
      request.respondWith({
        status: 200,
        responseText: '{"conferenceImage":"a-new-image"}'
      }).then(function () {
        // then ...
        // ... image data is filled
        expect(images.conferenceImage).to.equal('a-new-image')
        done()
      })
    })
  })
})
