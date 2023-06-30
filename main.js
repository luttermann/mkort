import './style.css';
import {Feature, Map, View} from 'ol';
import proj4 from "proj4";
import {register} from "ol/proj/proj4";
import * as olProj from "ol/proj";
import TileWMS from "ol/source/TileWMS";
import TileLayer from "ol/layer/Tile";
import * as olGeom from "ol/geom";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import {Fill, Stroke, Style} from "ol/style";
import {boundingExtent} from "ol/extent";

// Start by setting up projections for use with the Danish standard projection
// as well as [https://en.wikipedia.org/wiki/Geographic_coordinate_system]
const lonlatProj = olProj.get('EPSG:4326');
proj4.defs('EPSG:25832', "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs");
register(proj4);
const myProjection = olProj.get('EPSG:25832');
olProj.useGeographic();

// This is a configuration file, create "dataforsyningen.js" and set your token like this:
// const dataforsyningentoken = "ffffffffffffffffffffffffffffffff";
// export { dataforsyningentoken as default }
import dataforsyningentoken from "./dataforsyningen"
const df_headers = new Headers({"token": dataforsyningentoken});

// Style object for the matrikel area
const vectorStyle = new Style({
    stroke: new Stroke({
        color: 'rgba(255,0,0,1)',
        width: 1.5
    }),
    fill: new Fill({
        color: 'rgba(255,255,0,0.5)',
    })
});

// WMS tile source object, to represent and contain the settings for the specific server
// The easiest way to figure out the layers is by loading the WMS url in QGIS
// and then inspect the available layers.
const topo_skaermkort_DAF = new TileWMS({
    url: 'https://api.dataforsyningen.dk/kommunikation?token=' + dataforsyningentoken,
    params: {
        'LAYERS': 'Kommunikation_basis,Vejnavne_stoerre,Vejnavne_mindre',
        'TRANSPARENT': 'TRUE'
    }
});

// New tile layer created with the above source.
const dtk_skaermkort = new TileLayer({
    title: 'dtk_skaermkort',
    visible: true,
    source: topo_skaermkort_DAF
});

const mapView = new View({
    center: [12.5536, 55.6604],
    zoom: 10,
    projection: myProjection
});

const map = new Map({
    target: 'mkort',
    layers: [
        dtk_skaermkort
    ],
    view: mapView
});

// Get the HTMLElement that loaded this code. Then get some custom attributes.
// mkort-zoom: Sets the zoom level.
// mkort-center: Set the map centerpoint
// mkort-matr: semicolon seperated list of 'ejerlavkode:matr_no', ex: '2000174:1695i;2000174:1441b'
const mkort = document.getElementById('mkort');
const zoom = mkort.attributes.getNamedItem('mkort-zoom');
if (zoom !== null) {
    mapView.setZoom(parseInt(zoom.value));
}
const center = mkort.attributes.getNamedItem('mkort-center');
if (center !== null) {
    let latlon = center.value.split(',');
    mapView.setCenter([parseFloat(latlon[0]), parseFloat(latlon[1])]);
}
const matr = mkort.attributes.getNamedItem('mkort-matr')

// container for the features fetched from the API.
const matrFeatures = [];
// container for all the geographic points used in all features
// Used later to decide where to pan/zoom to.
let matrExtend = [];
if (matr !== null) {
    let matr_list = matr.value.split(';');
    let ejerlav = null;
    let matrikel = null;
    for (let i = 0; i < matr_list.length; i++) {
        ejerlav = matr_list[i].split(':')[0];
        matrikel = matr_list[i].split(':')[1];

        console.log("Ejerlav: ", ejerlav);
        console.log("Matrikel: ", matrikel);
        console.log('Fetching');
        // A lot of lines to do not a lot og actual work
        let matrikel_obj = await fetch('https://api.dataforsyningen.dk/rest/gsearch/v1.0/matrikel?q=' + matrikel +
            '&filter=ejerlavskode=\'' + ejerlav + '\'', {headers: df_headers})
            .then((response) => {
                if (!response.ok) {
                    console.log("Error getting matrikel information from api.dataforsyningen.dk");
                }
                return response.blob();
            })
            .then((response) => {
                return response.text();
            })
            .then((responde) => {
                return responde;
            });
        let matrikel_json = JSON.parse(matrikel_obj);
        if (matrikel_json.length > 0) {
            let mat_multi_poly = new olGeom.MultiPolygon(
                matrikel_json[0]['geometri']['coordinates']
            );
            mat_multi_poly.applyTransform(
                olProj.getTransform(myProjection, lonlatProj)
            );
            // JavaScript have a rather weird way to append values from one array to another!
            matrExtend = [].concat(matrExtend, mat_multi_poly.getCoordinates()[0][0])
            matrFeatures.push(new Feature({
                geometry: mat_multi_poly,
            }));
        }
    }
}
console.log("matrExtend", matrExtend);
let extend = boundingExtent(matrExtend);
console.log("extend", extend);

let mat_vector_layer = new VectorLayer({
    source: new VectorSource({
        features: matrFeatures
    }),
    style: vectorStyle
});
console.log('layer ext: ', mat_vector_layer);
mapView.fit(extend, {duration: 2500});
map.addLayer(mat_vector_layer);
