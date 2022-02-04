/**
 * Sample covariates
 */

var trainingSet = ee.FeatureCollection('foo'); // path to training set
var startDate = '2014-01-01'; // reference period for sampling
var endDate = '2016-12-31'; // reference period for sampling
var covariatePath = 'foo', // path to covariates
var yearString = startDate.slice(0,4)
  .concat(endDate.slice(0,4));
  
var covariateLoader = function(covariateCode){
  // load covariates
  var assetPath = covariatePath
    .concat(covariateCode)
    .concat('_')
    .concat(yearString)
    .concat('_')
    .concat('v2_0');
  var im = ee.Image(assetPath);
  return im;
};

var covariateComposite = covariateLoader('awe')
        .addBands (covariateLoader('evi'))
        .addBands (covariateLoader('gre_1090'))
        .addBands (covariateLoader('mnd'))
        .addBands (covariateLoader('ndv'))
        .addBands (covariateLoader('ndw'))
        .addBands (covariateLoader('nir_1090')) 
        .addBands (covariateLoader('swi_1090'))
        .addBands(ee.Image(globOptions.covariatePath.concat('abs_latitude_v2_0'))) 
        .addBands(ee.Image(globOptions.covariatePath.concat('alosTerrain_2006')))
        .addBands (covariateLoader('minTemp').select(['minimum_2m_air_temperature'],['minTemp']));
var bands = covariateComposite.bandNames();

function sampleCovariates(feature) {
    // sample covariates at each training point
    var predictorData = covariateComposite.reduceRegion({
    reducer: ee.Reducer.first(), 
    geometry: feature.geometry(),
    scale: 1}); 
    return feature.set(predictorData);
 }

var predictorSet = trainingSet.map(sampleCovariates); 

// export

var assetName = 'foo'; // path and asset name of predictorSet

var vars = {
  startDate:startDate,
  endDate:endDate,
  landsatCollection: 'C01/T1_SR',
  covariateName: covariateName,
  assetName: assetName,
  dateGenerated: ee.Date(Date.now())
};

Export.table.toAsset({
  collection: predictorSet.set(vars),
  description: 'export_tl',
  assetId:assetName
});