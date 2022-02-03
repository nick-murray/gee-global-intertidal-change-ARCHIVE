/****************************************** 
* Sample covariates
/******************************************/
  
/****************************************** 
 * Setup
 ******************************************/
var subversion = '##'
var trainingSet = ee.FeatureCollection("projects/UQ_intertidal/global_intertidal_v2_0/trainingData/global_intertidal_change/gitTrainingData_MASTER_".concat(subversion));

// Coast filter
var simpleCoastLine = ee.FeatureCollection('projects/UQ_intertidal/dataMasks/simpleNaturalEarthCoastline_v1').first().geometry();
var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);
var dataMask = ee.Image('projects/UQ_intertidal/dataMasks/topyBathyEcoMask_300m_v2_0_3'); 

// Reference period
var startDate = '2014-01-01'; 
var endDate = '2016-12-31'; 

// Load covariates
var covariatePath = 'projects/UQ_intertidal/covariate_layers/L3_' //for the rest
var yearString = startDate.slice(0,4)
  .concat(endDate.slice(0,4));
  
var covariateLoader = function(covariateCode){
  // build path name to each covariate
  var assetPath = covariatePath
    .concat(covariateCode)
    .concat('_')
    .concat(yearString)
    .concat('_')
    .concat('v2_0');
  var im = ee.Image(assetPath);
  return im;
};

// Develop single composite
var covariateComposite = covariateLoader('awe')
        .addBands (covariateLoader('evi'))
        .addBands (covariateLoader('gre_1090'))
        .addBands (covariateLoader('mnd'))
        .addBands (covariateLoader('ndv'))
        .addBands (covariateLoader('ndw'))
        .addBands (covariateLoader('nir_1090')) 
        .addBands (covariateLoader('swi_1090'))
        .addBands(ee.Image('projects/UQ_intertidal/covariate_layers/L3_abs_latitude_v2_0'))
        .addBands(ee.Image('JRC/GSW1_0/GlobalSurfaceWater')
          .select(['occurrence'], ['gsw'])
          .unmask())
        .addBands(ee.Image('NOAA/NGDC/ETOPO1')
          .select(['bedrock'], ['eto'])
          .resample('bicubic'))
        .addBands(ee.Image('projects/UQ_intertidal/covariate_layers/L3_alosTerrain_2006_v2_0'))
        .addBands(covariateLoader('minTemp').select(['minimum_2m_air_temperature'],['minTemp']))
        //.clip(site); // Can remove on global export
var bands = covariateComposite.bandNames();

/*********************************
 * Sample covariate
 *********************************/

function sampleCovariates(feature) {
    // sample covariate layers at each training point
    var predictorData = covariateComposite.reduceRegion({
    reducer: ee.Reducer.first(), 
    geometry: feature.geometry(),
    scale: 1}); 
    return feature.set(predictorData);
 }
var predictorSet = trainingSet.map(sampleCovariates); 

/*********************************
 * Export training library
 *********************************/

// outputs
var assetName = 'projects/UQ_intertidal/global_intertidal_v2_0/covariateLibraries/'
  .concat('trainingLibrary')
print (assetName, 'assetName');

// training library properties
var vars = {
  startDate:startDate,
  endDate:endDate,
  landsatCollection: 'C01/T1_SR',
  assetName: assetName,
  dateGenerated: ee.Date(Date.now())
};

// image properties
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
  description: 'exportTrainingLibrary',
  assetId:assetName
});