/**
 * Develop covariates
 */

var simpleCoastLine = ee.FeatureCollection('projects/UQ_intertidal/dataMasks/simpleNaturalEarthCoastline_v1').first().geometry();
var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);
var dataMask = ee.Image('projects/UQ_intertidal/dataMasks/topyBathyEcoMask_300m_v2_0_3');  // sets mapping area
var startDate = '2017-01-01';
var endDate = '2019-12-31';
var bandSelect = ['green', 'swir1', 'swir2', 'nir', 'red', 'blue'];
var bands8 = ['B3', 'B6', 'B7', 'B5', 'B4', 'B2'];
var bands7 = ['B2', 'B5', 'B7', 'B4', 'B3','B1'];
var parallelScale = 8;

var mappingFunctions = { 
  
  applyPixelQAcloudMask: function (image) {
    // Mask out shadow, snow, and cloud using image qa layer. 
    var qa = image.select('pixel_qa');
    var mask = image.updateMask(
      qa.bitwiseAnd(1 << 3).eq(0)       // Cloud shadow bit
      .and(qa.bitwiseAnd(1 << 4).eq(0)) // Snow bit
      .and(qa.bitwiseAnd(1 << 5).eq(0))); // Cloud bit;
    return mask;
  },
  
  applyCoastMask: function (image) {
    // apply coastal data mask to image
    var im = image.updateMask(dataMask);
    return im;
  },
  
  applyNDWI: function(image) {
    // apply NDWI to image
    var ndwi = image.normalizedDifference(['green','nir']);
    return ndwi.select([0], ['ndw']);
  },
  
  applyMNDWI: function(image) {
    // apply MNDWI to image
    var mndwi = image.normalizedDifference(["green","swir1"]);
    return mndwi.select([0], ['mnd']);
  },
  
  applyAWEI: function(image) {
    // apply AWEI to image
    var awei = image.expression("awe = 4*(b('green')-b('swir1'))-(0.25*b('nir')+2.75*b('swir2'))");
    return awei;
  }, 
  
  applyNDVI: function(image) {
    // apply NDVI to image
    var ndvi = image.normalizedDifference(['nir','red']);
    return ndvi.select([0], ['ndv']);
  }, 
  
  applyEVI: function(image) {
    //apply EVI to image
    var evi = image.expression("evi = 2.5*(b('nir')-b('red'))/(b('nir')+6*b('red') - 7.5*b('blue') + 1)");
    return evi;
  }
};

var reducer = ee.Reducer.min()
    .combine(ee.Reducer.max(), '', true)
    .combine(ee.Reducer.stdDev().setOutputs(['stdev']), '', true)
    .combine(ee.Reducer.median().setOutputs(['med']), '', true)
    .combine(ee.Reducer.percentile([10, 25, 50, 75,90]), '', true)
    .combine(ee.Reducer.intervalMean(0, 10).setOutputs(['0010']), '', true)
    .combine(ee.Reducer.intervalMean(10, 25).setOutputs(['1025']), '', true)
    .combine(ee.Reducer.intervalMean(25, 50).setOutputs(['2550']), '', true)
    .combine(ee.Reducer.intervalMean(50, 75).setOutputs(['5075']), '', true)
    .combine(ee.Reducer.intervalMean(75, 90).setOutputs(['7590']), '', true)
    .combine(ee.Reducer.intervalMean(90, 100).setOutputs(['90100']), '', true)
    .combine(ee.Reducer.intervalMean(10, 90).setOutputs(['1090']), '', true)
    .combine(ee.Reducer.intervalMean(25, 75).setOutputs(['2575']), '', true);

function generateCollection() { 
  // Create image collection
  var L5collection = ee.ImageCollection('LANDSAT/LT05/C01/T1_SR')
      .filterDate(startDate, endDate)
      .filterBounds(site)
      .filter(ee.Filter.intersects(".geo", simpleCoastLine, null, null, 1000))
      .filterMetadata('WRS_ROW', 'less_than', 120)  // descending (daytime) landsat scenes only
      .map(mappingFunctions.applyPixelQAcloudMask)
      .map(mappingFunctions.applyCoastMask)
      .select(bands7, bandSelect);
  var L7collection = ee.ImageCollection('LANDSAT/LE07/C01/T1_SR')
      .filterDate(startDate, endDate)
      .filterBounds(site)
      .filter(ee.Filter.intersects(".geo", simpleCoastLine, null, null, 1000))
      .filterMetadata('WRS_ROW', 'less_than', 120)  // descending (daytime) landsat scenes only
      .map(mappingFunctions.applyPixelQAcloudMask)
      .map(mappingFunctions.applyCoastMask)
      .select(bands7, bandSelect);
  var L8collection = ee.ImageCollection('LANDSAT/LC08/C01/T1_SR')
      .filterDate(startDate, endDate)
      .filterBounds(site)
      .filter(ee.Filter.intersects(".geo", simpleCoastLine, null, null, 1000))
      .filterMetadata('WRS_ROW', 'less_than', 120)  // descending (daytime) landsat scenes only
      .map(mappingFunctions.applyPixelQAcloudMask)
      .map(mappingFunctions.applyCoastMask)
      .select(bands8, bandSelect);
  var collectionFull = ee.ImageCollection(L5collection
      .merge(L7collection)
      .merge(L8collection));
  return collectionFull;
}

var collection = generateCollection(); 

var covariates = { 
  awei: collection.map(mappingFunctions.applyAWEI)
      .reduce(reducer, parallelScale), 
  ndwi: collection.map(mappingFunctions.applyNDWI)
      .reduce(reducer, parallelScale),
  mndwi: collection.map(mappingFunctions.applyMNDWI)
      .reduce(reducer, parallelScale),
  ndvi: collection.map(mappingFunctions.applyNDVI)
      .reduce(reducer, parallelScale),
  evi: collection.map(mappingFunctions.applyEVI)
      .reduce(reducer, parallelScale),
  nir: collection.select(['nir'])
      .reduce(ee.Reducer.intervalMean(10, 90)
      .setOutputs(['1090'])),
  green: collection.select(['green'],['gre'])
      .reduce(ee.Reducer.intervalMean(10, 90)
      .setOutputs(['1090'])),
  swir1: collection.select(['swir1'],['swi'])
      .reduce(ee.Reducer.intervalMean(10, 90)
      .setOutputs(['1090']))
};

var covariateName = 'evi'; // export separately ([awe, ndw, mnd, ndv, evi, nir_1090, gre_1090, swi_1090]))

var assetName = 'foo' // set file path
  .concat('_')
  .concat(startDate.slice(0,4))
  .concat(endDate.slice(0,4))

var vars = {
  startDate:startDate,
  endDate:endDate,
  landsatCollection: 'C01/T1_SR',
  covariateName: covariateName,
  assetName: assetName,
  dateGenerated: ee.Date(Date.now())
};

var covariateExport = covariates
    .evi // select variablefor export ([awei, ndwi, mndwi, ndvi, evi, nir, green, swir1)
    .set(vars)
    .float(); 

Export.image.toAsset({
  image: covariateExport, 
  description: 'export_'
    .concat(covariateName)
    .concat('_')
    .concat(startDate.slice(0,4))
    .concat(endDate.slice(0,4)),
  assetId: assetName,
  scale: 30,
  region: site, 
  maxPixels: 10000000000000
});