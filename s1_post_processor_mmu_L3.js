/*******************
 * s1_postProcessor  
 *******************/

var startDate = '2017-01-01';
var endDate = '2019-12-31';
var mmuPixels = 100 // No. pixels
var yearString = startDate.slice(0,4)
  .concat(endDate.slice(0,4));
var gicPath = 'path to s1'; // <-- IMPORT GIC STAGE 1 

var gicImage =  ee.Image(gicPath
    .concat('_')
    .concat(yearString)
    .concat('_')
    .concat(version));

var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);  

// Function to effect removal of patches >MMU size
function mmuRemove (gicImage,mmuPixels){
  // removes salt and pepper 
  var image = gicImage.select([0]).gte(50).selfMask();
  var connected = image.connectedPixelCount(mmuPixels+2,true); // use eight-connected to allow linear features
  var elim = connected.gte(mmuPixels).selfMask().select([0],['gic_cw_extent']); // rename
  var pp1 = gicImage.select([1]).updateMask(elim); 
  var ppOut = gicImage.select([0]).addBands(pp1).addBands(elim);
  return ppOut;
}
var pp = mmuRemove(gicImage.clip(site), mmuPixels).set({
  mmuNoPixels:mmuPixels
  })
print ('pp:', pp)

var assetName = 'file path'
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
  maxPixels: 1000000000000
});
