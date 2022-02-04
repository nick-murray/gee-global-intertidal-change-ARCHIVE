/**
 * change flag
 */

var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);  
var gic2001 = ee.Image('foo'), // import post-processed tw_export (pp)
    gic2004 = ee.Image('foo'),
    gic2007 = ee.Image('foo'),
    gic2010 = ee.Image('foo'),
    gic2013 = ee.Image('foo'),
    gic2016 = ee.Image('foo'),
    gic2019 = ee.Image('foo');

// gic_s1_probability
var s1_probCollection = ee.ImageCollection([
    gic2001.select([0]), 
    gic2004.select([0]),
    gic2007.select([0]),
    gic2010.select([0]),
    gic2013.select([0]),
    gic2016.select([0]),
    gic2019.select([0])]);

// gic_s1_classification
var cwExtents = ee.ImageCollection([
    gic2001.select([1]), 
    gic2004.select([1]),
    gic2007.select([1]),
    gic2010.select([1]),
    gic2013.select([1]),
    gic2016.select([1]),
    gic2019.select([1])]);

var makeLossGain = function(y1, y2, year){
  // Returns bands of loss/gain over time period
  var dif = y1.select([0])
    .subtract(y2.select([0]))
    .rename(['difference']);
  var loss = y1.select([1])
    .updateMask(y2.select([1]).unmask().lt(1))
    .updateMask(gic2001.select([1])) // can only be lost if occurred in 2001
    .updateMask(gic2019.select([1]).unmask().lt(1)) // can only be lost if no occurrences in 2019
    .rename(['loss']);
  var lossYear = loss.remap([1],[year])
    .rename(['lossYear']).int()
    .updateMask(gic2019.select([1]).unmask().lt(1)); 
  var gain = y2.select([1])
    .updateMask(y1.select([1]).unmask().lt(1)) 
    .updateMask(gic2001.select([1]).unmask().lt(1)) // no gain if already exists
    .updateMask(gic2019.select([1])) // gain only if still occurring in 2019
    .rename(['gain']);
  var gainYear = gain.remap([1],[year])
    .rename(['gainYear']).int()
    .updateMask(gic2001.select([1]).unmask().lt(1)) 
    .updateMask(gic2019.select([1]));
  var out = dif.addBands(loss)
    .addBands(gain)
    .addBands(lossYear)
    .addBands(gainYear);
  return out;
};

var lossGainCollection = ee.ImageCollection([
  makeLossGain(gic2001, gic2004,4),
  makeLossGain(gic2004, gic2007,7),
  makeLossGain(gic2007, gic2010,10),
  makeLossGain(gic2010, gic2013,13),
  makeLossGain(gic2013, gic2016,16),
  makeLossGain(gic2016, gic2019,19)]);
print (lossGainCollection);

var totalLoss = lossGainCollection.select(['loss']).sum().gte(1).selfMask(); 
var totalGain = lossGainCollection.select(['gain']).sum().gte(1).selfMask(); 
var lossYear = lossGainCollection.select(['lossYear']).max(); // latest year where it was first not observed
var gainYear = lossGainCollection.select(['gainYear']).min(); // first year it was observed
var changeFlag = ee.Image(totalLoss
  .addBands(totalGain)
  .addBands(lossYear)
  .addBands(gainYear)
  .copyProperties(gic2019, gic2019.propertyNames()));

var assetName = 'foo'; // path and asset name

// Export final classified image to asset
Export.image.toAsset({
  image: changeFlag, 
  description: 'export_change_flag',
  assetId: assetName,
  scale: 30,
  region: site,
  pyramidingPolicy: {'.default': 'mode'},
  maxPixels: 1000000000000
});