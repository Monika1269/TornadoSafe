
// 1. Create the map
const map = L.map("map").setView([33.77, -85.83], 10);

// 2. Add OpenStreetMap
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    keepBuffer: 4
}).addTo(map);

// Refresh map size after the browser window changes
window.addEventListener("resize", function() {
    map.invalidateSize();
});

// 3. Create the Calhoun County boundary layer
const countyLayer = L.geoJSON(null, {
    style: {
        color: "red",
        weight: 3,
        fill: false
    }
}).addTo(map);

// 4. Create tornado shelter layer
const shelterLayer = L.geoJSON(null, {

    pointToLayer: (feature, latlng) => {
        return L.circleMarker(latlng, {
            radius: 7,
            color: "white",
            weight: 2,
            fillColor: "blue",
            fillOpacity: 1,
            bubblingMouseEvents: false
        });
    },

onEachFeature: (feature, layer) => {
    const shelter = feature.properties || {};

    const name = shelter.USER_Shelter_Name || "Unnamed Shelter";
    const address = shelter.USER_Address || "Address unavailable";

    layer.bindPopup(`
        <b>${name}</b><br><br>

        <b>Address:</b><br>
        ${address}<br><br>

      <small>
            Check published opening conditions.
        </small><br>
        <a href="https://www.calhounema.org/shelters"
           target="_blank" rel="noopener noreferrer">
            Official Shelter Information
        </a>

       
    `);
}

}).addTo(map);

    

 // Layer for the five nearest shelters
const nearestShelterLayer = L.layerGroup().addTo(map);
// Layer for displaying the selected driving route
const routeLayer = L.geoJSON(null, {
    style: {
        color: "green",
        weight: 5
    }
}).addTo(map);


// 5. Load Calhoun County boundary
fetch("data/Calhoun_county.geojson")
    .then(response => {
        if (!response.ok) throw new Error("County file not found");
        return response.json();
    })
    .then(data => {
        countyLayer.addData(data);
        map.fitBounds(countyLayer.getBounds());
        console.log("County boundary loaded");
    })
    .catch(error => console.error(error));
let shelters = [];

// 6. Load tornado shelters
fetch("data/shelters.geojson")
    .then(response => {
        if (!response.ok) throw new Error("Shelter file not found");
        return response.json();
    })
    
.then(data => {
    shelters = data.features;
    shelterLayer.addData(data);

    console.log("Shelters loaded:", shelters.length);
})


// 7. Add layer checkboxes
L.control.layers(null, {
    "Calhoun County Boundary": countyLayer,
    "Tornado Shelters": shelterLayer
}, {
    collapsed: false
}).addTo(map);

// 8. Allow users to select a location
let selectedMarker;

map.on("click", function(event) {
    if (selectedMarker) {
        map.removeLayer(selectedMarker);
    }

    selectedMarker = L.marker(event.latlng).addTo(map);

    document.getElementById("location-info").innerHTML = `
        <b>Selected Location</b><br>
        Latitude: ${event.latlng.lat.toFixed(5)}<br>
        Longitude: ${event.latlng.lng.toFixed(5)}
    `;
    nearestShelterLayer.clearLayers();
    routeLayer.clearLayers();

    document.getElementById("shelter-results").textContent =
        "Click Find Nearest Shelters to calculate nearby shelters.";
});

// Find shelters only when the button is clicked
document.getElementById("find-shelters").addEventListener("click", function() {

    if (!selectedMarker) {
        alert("Please select a location on the map first.");
        return;
    }

    const location = selectedMarker.getLatLng();

    findNearbyShelters(location.lat, location.lng);
});

// 9. Clear selected location
document.getElementById("clear-location").addEventListener("click", function() {

    // Remove the selected marker from the map
    if (selectedMarker) {
        map.removeLayer(selectedMarker);
        selectedMarker = null;
    }
    // Remove the five nearest shelter markers
    nearestShelterLayer.clearLayers();
    routeLayer.clearLayers();

    // Reset location information
    document.getElementById("location-info").textContent =
        "No location selected. Click on the map to choose a location.";

    // Reset nearby shelter results
    document.getElementById("shelter-results").textContent =
        "Nearby shelters will appear here after selecting a location.";

});

// 10. Find nearest shelters using road travel time
async function findNearbyShelters(latitude, longitude) {
    const findButton = document.getElementById("find-shelters");
    findButton.disabled = true;

    const resultsBox = document.getElementById("shelter-results");

    resultsBox.textContent = "Calculating road travel times...";

    // Selected location comes first
    const locations = [[longitude, latitude]];

    // Add all shelter coordinates
    shelters.forEach(function(shelter) {
        locations.push(shelter.geometry.coordinates);
    });

    // Shelter positions in the locations array
    const destinations = shelters.map(function(shelter, index) {
        return index + 1;
    });

    try {
        const response = await fetch(
            "https://api.heigit.org/openrouteservice/v2/matrix/driving-car",
            {
                method: "POST",
                headers: {
                    "Authorization": ORS_API_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    locations: locations,
                    sources: [0],
                    destinations: destinations,
                    metrics: ["distance", "duration"],
                    units: "mi"
                })
            }
        );

        if (!response.ok) {
            throw new Error("Matrix API error: " + response.status);
        }

        const data = await response.json();

        // Get driving times and distances
        const results = shelters.map(function(shelter, index) {
            return {
                name: shelter.properties.USER_Shelter_Name,
                address: shelter.properties.USER_Address,
                coordinates: shelter.geometry.coordinates,
                distance: data.distances[0][index],
                duration: data.durations[0][index]
            };
        });

        // Remove shelters with no available road route
        const reachable = results.filter(function(shelter) {
            return shelter.distance !== null &&
                   shelter.duration !== null;
        });

        // Sort by shortest driving time
        reachable.sort(function(a, b) {
            return a.duration - b.duration;
        });

        // Select five nearest shelters
        const nearest = reachable.slice(0, 5);


nearestShelterLayer.clearLayers();

// Add numbered markers for the five nearest shelters
nearest.forEach(function(shelter, index) {

    const coordinates = shelter.coordinates;

    const marker = L.marker(
        [coordinates[1], coordinates[0]],
        {
            icon: L.divIcon({
                className: "nearest-shelter-icon",
                html: `<div class="shelter-number">${index + 1}</div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15]
            })
        }
    );

    marker.bindPopup(`
        <b>${index + 1}. ${shelter.name}</b><br>
        ${shelter.address}<br>
        Driving distance: ${shelter.distance.toFixed(2)} miles<br>
        Estimated driving time: ${(shelter.duration / 60).toFixed(1)} minutes
    `);

    marker.addTo(nearestShelterLayer);
});


        // Display results
        let html = "";

        nearest.forEach(function(shelter, index) {

        html += `
                 <div class="shelter-result">
                <b>${index + 1}. ${shelter.name}</b><br>
                ${shelter.address}<br>
                Driving distance: ${shelter.distance.toFixed(2)} miles<br>
                Estimated driving time: ${(shelter.duration / 60).toFixed(1)} minutes<br>

            <button class="show-route-btn"
            data-longitude="${shelter.coordinates[0]}"
            data-latitude="${shelter.coordinates[1]}">
             Show Route
         </button>
    </div>
    `;
        });

        resultsBox.innerHTML = html ||
            "No reachable shelters were found.";
    
// Connect each Show Route button to the Directions API
resultsBox.querySelectorAll(".show-route-btn").forEach(function(button) {

    button.addEventListener("click", function() {

        const longitude = Number(button.dataset.longitude);
        const latitude = Number(button.dataset.latitude);

        showRoute([longitude, latitude]);
    });
});


    
} catch (error) {
    console.error("Routing error:", error);

    resultsBox.textContent =
        "Unable to calculate road travel times. Please try again.";

} finally {
    findButton.disabled = false;
}

}

 // 11. Display a driving route to a selected shelter
async function showRoute(coordinates) {

    if (!selectedMarker) {
        alert("Please select a location first.");
        return;
    }

    // Remove any previously displayed route
    routeLayer.clearLayers();

    // Get the user's selected location
    const location = selectedMarker.getLatLng();

    // ORS uses [longitude, latitude]
    const routeCoordinates = [
        [location.lng, location.lat],
        coordinates
    ];

    try {
        const response = await fetch(
            "https://api.heigit.org/openrouteservice/v2/directions/driving-car/geojson",
            {
                method: "POST",
                headers: {
                    "Authorization": ORS_API_KEY,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    coordinates: routeCoordinates
                })
            }
        );

        if (!response.ok) {
            throw new Error("Directions API error: " + response.status);
        }

        const data = await response.json();

        // Display the road route
        routeLayer.addData(data);

        // Zoom to show the route
        map.fitBounds(routeLayer.getBounds(), {
            padding: [30, 30]
        });
        map.invalidateSize();

    } catch (error) {
        console.error("Route error:", error);
        alert("Unable to display the driving route.");
    }
}

 // 12. Load active NWS weather alerts for Calhoun County
async function loadWeatherAlerts() {

    const alertsBox = document.getElementById("weather-alerts");

    alertsBox.textContent = "Checking active weather alerts...";

    try {
        // Calhoun County, Alabama
        const response = await fetch(
            "https://api.weather.gov/alerts/active?area=AL",
            {
                headers: {
                    "Accept": "application/geo+json"
                }
            }
        );

        if (!response.ok) {
            throw new Error("NWS API error: " + response.status);
        }

        const data = await response.json();
       
        const allowedAlerts = [
            "Tornado Warning",
             "Tornado Watch",
             "Severe Thunderstorm Warning",
             "Severe Thunderstorm Watch"
        ];

        const alerts = (data.features || []).filter(function(alert) {
             return allowedAlerts.includes(alert.properties.event);
});


        // No active alerts
        if (alerts.length === 0) {
            alertsBox.textContent =
                "No active NWS weather alerts reported for Alabama.";
            return;
        }

        // Clear previous content
        alertsBox.innerHTML = "";

        // Display each active alert
        alerts.forEach(function(alert) {

            const info = alert.properties;

            const alertDiv = document.createElement("div");
            alertDiv.className = "weather-alert";

            const heading = document.createElement("strong");
            heading.textContent = info.event || "Weather Alert";

            const severity = document.createElement("p");
            severity.textContent =
                "Severity: " + (info.severity || "Unknown");

            const area = document.createElement("p");
            area.textContent =
                "Area: " + (info.areaDesc || "Not specified");

            const description = document.createElement("p");
            description.textContent =
                info.headline || info.description || "";

            alertDiv.appendChild(heading);
            alertDiv.appendChild(severity);
            alertDiv.appendChild(area);
            alertDiv.appendChild(description);

            if (info.instruction) {
                const instruction = document.createElement("p");
                instruction.textContent =
                    "Instructions: " + info.instruction;
                alertDiv.appendChild(instruction);
            }

            alertsBox.appendChild(alertDiv);
        });

    } catch (error) {
        console.error("Weather API error:", error);

        alertsBox.textContent =
            "Unable to retrieve weather alerts. Please check the official NWS website.";
    }
}

// Load weather alerts when TornadoSafe opens
loadWeatherAlerts();
