Map.setOptions('SATELLITE');
var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);  

/*******************
 * Setups
 *******************/

var gic2001 = ee.Image('projects/UQ_intertidal/global_intertidal_v2_0/outputs/gic_v2_0/L4_pp_error_vectors/L4_gic_19992001'),
    gic2004 = ee.Image('projects/UQ_intertidal/global_intertidal_v2_0/outputs/gic_v2_0/L4_pp_error_vectors/L4_gic_20022004'),
    gic2007 = ee.Image('projects/UQ_intertidal/global_intertidal_v2_0/outputs/gic_v2_0/L4_pp_error_vectors/L4_gic_20052007'),
    gic2010 = ee.Image('projects/UQ_intertidal/global_intertidal_v2_0/outputs/gic_v2_0/L4_pp_error_vectors/L4_gic_20082010'),
    gic2013 = ee.Image('projects/UQ_intertidal/global_intertidal_v2_0/outputs/gic_v2_0/L4_pp_error_vectors/L4_gic_20112013'),
    gic2016 = ee.Image('projects/UQ_intertidal/global_intertidal_v2_0/outputs/gic_v2_0/L4_pp_error_vectors/L4_gic_20142016'),
    gic2019 = ee.Image('projects/UQ_intertidal/global_intertidal_v2_0/outputs/gic_v2_0/L4_pp_error_vectors/L4_gic_20172019');

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
    gic2001.select([2]), 
    gic2004.select([2]),
    gic2007.select([2]),
    gic2010.select([2]),
    gic2013.select([2]),
    gic2016.select([2]),
    gic2019.select([2])]);

/*******************
 * Patches Lost or Gained - Actual
 *******************/

var makeLossGain = function(y1, y2, year){
  // Function for returning 3 bands loss/gain/difference image.
  // Potentioal to change .select([2]) to .select([0]).gte(xxx) and apply xxx as a probability threshold.
  var dif = y1.select([0])
    .subtract(y2.select([0]))
    .rename(['difference']);
  var loss = y1.select([2])
    .updateMask(y2.select([2]).unmask().lt(1))
    .updateMask(gic2001.select([2])) // can only be lost if it occurred in 2001
    .updateMask(gic2019.select([2]).unmask().lt(1)) // can only be lost if it doesn't exist today
    .rename(['loss']);
  var lossYear = loss.remap([1],[year])
    .rename(['lossYear']).int()
    .updateMask(gic2019.select([2]).unmask().lt(1)); // loss only occurs if it's not there in 2019
  var gain = y2.select([2])
    .updateMask(y1.select([2]).unmask().lt(1)) 
    .updateMask(gic2001.select([2]).unmask().lt(1)) // gain doesn't happen if it already exists (inv mask 2001)
    .updateMask(gic2019.select([2])) // gain only stays around if it's still here (mask 2019)
    .rename(['gain']);
  var gainYear = gain.remap([1],[year])
    .rename(['gainYear']).int()
    .updateMask(gic2001.select([2]).unmask().lt(1)) // gain doesn't happen if it already exists (inv mask 2001)
    .updateMask(gic2019.select([2])); // gain only stays around if it's still here (mask 2019)
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

var totalLoss = lossGainCollection.select(['loss']).sum().gte(1).selfMask(); // total 20 year loss
var totalGain = lossGainCollection.select(['gain']).sum().gte(1).selfMask(); // total 20 year gain
var lossYear = lossGainCollection.select(['lossYear']).max(); // choose the latest year where it was first not observed
var gainYear = lossGainCollection.select(['gainYear']).min(); // choose the first year it was gained
// var lossType = gic2001.select([1]).updateMask(totalLoss).rename(['lossType']);
// var gainType = gic2019.select([1]).updateMask(totalGain).rename(['gainType']);
var changeImage = ee.Image(totalLoss
  .addBands(totalGain)
  .addBands(lossYear)
  .addBands(gainYear)
  // .addBands(lossType)
  // .addBands(gainType)
  .copyProperties(gic2019, gic2019.propertyNames()));

print (changeImage);
Map.addLayer(changeImage.select(['loss']),{palette: ['darkred'], min:1, max: 1}, 'Function: cwLoss');
Map.addLayer(changeImage.select(['gain']),{palette: ['lime'], min:1, max: 1}, 'Function: cwGain');
// Map.addLayer(changeImage.select(['lossYear']),{palette: viridis, min:4, max: 19}, 'Function: lossYearMax');
// Map.addLayer(changeImage.select(['gainYear']),{palette: plasma, min:4, max: 19}, 'Function: gainYearMin');
// Map.addLayer(changeImage.select(['lossType']),{palette: classPalette, min:0, max: 5}, 'Function: lossType');
// Map.addLayer(changeImage.select(['gainType']),{palette: classPalette, min:0, max: 5}, 'Function: gainType');

var assetName = 'projects/UQ_intertidal/global_intertidal_v2_0/outputs/gic_v2_0/L5_change_maps_raw/L5_gic_changeMaps_19992019'
  .concat('_')
  .concat(finalversion);
print ('assetName:',assetName);

// Export final classified image to asset
Export.image.toAsset({
  image: changeImage, 
  description: 'export_L5_change_maps_'
  .concat(finalversion),
  assetId: assetName,
  scale: 30,
  region: site,
  pyramidingPolicy: {'.default': 'mode'},
  maxPixels: 1000000000000
});


