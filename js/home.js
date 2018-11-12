const zoomLevel = 12;
const numDeltas = 100;
const delay = 10; //milliseconds
let i = 0;
let deltaLat;
let deltaLng;
let markers = {};

initApp = () => {
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      // User is signed in.
      // console.log(user);
      // Get user token
      firebase.auth().currentUser.getIdToken(true).then((token) => {
        console.log(token);
        const database = firebase.database();
        const userReference = database.ref(`user/${user.uid}/group`);
        userReference.once('value').then((data) => {
          const group = data.val();
          const membersReference = database.ref(`group/${group}/members`);
          membersReference.once('value', (members) => {
            const bounds = new google.maps.LatLngBounds();
            const infoWindow = new google.maps.InfoWindow();
            const map = initMap();
            const directionsService = new google.maps.DirectionsService();
            members = members.val();
            // loop through members
            Object.keys(members).forEach((userId) => {
              const directionsDisplay = new google.maps.DirectionsRenderer({
                map: map,
                preserveViewport: true,
                suppressMarkers: true,
              });
              const member = members[userId];
              if (member === null || typeof member !== 'object' || !member.hasOwnProperty('coordinates')) return;
              const coordinatesReference = membersReference.child(`${userId}/coordinates`).orderByChild('date');
              coordinatesReference.once('value', (coordinatesData) => {
                const coordinates = coordinatesData.val();
                if (!coordinates) return;
                // convert to array
                const coordinatesArray = Object.values(coordinates);
                const first = coordinatesArray.shift();
                const marker = createMarker(first, map, infoWindow, directionsDisplay);
                markers[userId] = marker;
                bounds.extend(marker.position);
                if (!coordinatesArray.length) return;
                marker.setCoordinates(coordinatesArray);
                coordinatesArray.forEach((coordinate) => {
                  marker.calculateRoute(directionsService, coordinate);
                });
              });

              // listen for new coordinates
              coordinatesReference.startAt(new Date().getTime()).on('child_added', (snapshot) => {
                const user = getUserFromPath(snapshot.ref.toString());
                const newCoordinate = snapshot.val();
                const marker = markers[user];
                // todo: create marker if doesn't exist?
                if (!marker) return;
                
                marker.addCoordinate(newCoordinate);
                if (!marker.isInRoute) {
                  marker.calculateRoute(directionsService);
                }
              });
            });

            // after the map is done scaling
            const listener = google.maps.event.addListener(map, 'idle', () => {
              // now fit the map to the newly inclusive bounds
              map.fitBounds(bounds);
              map.setZoom(zoomLevel);
              google.maps.event.removeListener(listener);
            });
          });
        });
      }).catch((error) => {
        // Handle error
        console.log(error);
      });
    } else {
      // User is logged out.
      window.location.href = 'index.html';
    }
  }, (error) => {
    console.log(error);
  });
};

initMap = () => {
  return new google.maps.Map(document.getElementById('map'), {
    /*center: {
      lat: 34.0530368,
      lng: -118.1268745,
    },*/
    zoom: zoomLevel,
  });
};

convertCoordinate = (coordinate) => {
  return {
    lat: coordinate.latitude,
    lng: coordinate.longitude,
  };
};

createMarker = (coordinate, map, infoWindow, directionsDisplay) => {
  class Marker extends google.maps.Marker {
    constructor(options) {
      super(options);
      this.isInRoute = false;
    }

    addCoordinate(coordinate) {
      this.coordinates.push(coordinate);
    }

    setCoordinates(coordinates) {
      this.coordinates = coordinates;
    }

    setDirectionsDisplay(directionsDisplay) {
      this.directionsDisplay = directionsDisplay;
    }

    calculateRoute(directionsService) {
      if (!this.coordinates.length) return;
      this.isInRoute = true;
      const coordinate = this.coordinates.shift();

      const request = {
        origin: this.getPosition(),
        destination: convertCoordinate(coordinate),
        travelMode: 'DRIVING',
      };
      directionsService.route(request, (response, status) => {
        if (status !== 'OK') {
          console.log(status);
          return;
        }
    
        this.directionsDisplay.setDirections(response);
        const route = response.routes[0];
        const routes = route.overview_path.length;
        for (let i = 0; i < routes; i++) {
          setTimeout(() => {
            this.setPosition(route.overview_path[i]);
            if (i == routes - 1) {
              this.isInRoute = false;
              if (this.coordinates.length) {
                this.calculateRoute(directionsService);
              }
            }
          }, (i+1) * 1000);
        }
      });
    };
  }

  const marker = new Marker({
    position: convertCoordinate(coordinate),
    map: map,
  });
  marker.setDirectionsDisplay(directionsDisplay);
  marker.addListener('click', () => {
    infoWindow.setContent(getMarkerContent(coordinate));
    infoWindow.open(map, marker);
  });

  return marker;
};

getMarkerContent = (coordinate, user) => {
  const date = new Date(coordinate.date * -1);
  return `<div>${user}</div><div>${date.toString()}</div>`;
};

getUserFromPath = (path) => {
  const parts = path.split(/members\/|\/coordinates/);
  return parts[1];
}

window.addEventListener('load', () => {
  initApp();
});
