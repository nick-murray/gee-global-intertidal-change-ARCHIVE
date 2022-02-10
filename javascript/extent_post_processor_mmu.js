/**
 * Global tidal wetland extent post processor.
 */

var startDate = '2017-01-01';
var endDate = '2019-12-31';
var mmuPixels = 100 
var yearString = startDate.slice(0,4)
  .concat(endDate.slice(0,4));
var gicPath = 'foo'; // path to tw_export

var gicImage =  ee.Image(gicPath
    .concat('_')
    .concat(yearString);

var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);  

function mmuRemove (gicImage,mmuPixels){
  // remove small patches
  var image = gicImage.select([0]).gte(50).selfMask(); 
  var connected = image.connectedPixelCount(mmuPixels+2,true); // eight-connected
  var elim = connected.gte(mmuPixels).selfMask().select([0],['gic_cw_extent']); 
  var ppOut = gicImage.select([0]).addBands(elim);
  return ppOut;
}
var pp = mmuRemove(gicImage, mmuPixels).set({
  mmuNoPixels:mmuPixels
  })

var assetName = 'foo'
  .concat('_')
  .concat(startDate.slice(0,4))
  .concat('')
  .concat(endDate.slice(0,4))
  
// Export final classified image to asset
Export.image.toAsset({
  image: pp, 
  description: 'export_pp',
  assetId: assetName,
  scale: 30,
  region: site,
  pyramidingPolicy: {'.default': 'mode'},
  maxPixels: 1000000000000
});