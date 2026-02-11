
export function initFirebase(){
 const config={
   apiKey:"YOUR_API_KEY",
   authDomain:"YOUR_PROJECT.firebaseapp.com",
   databaseURL:"https://YOUR_PROJECT.firebaseio.com",
   projectId:"YOUR_PROJECT"
 };
 if(!firebase.apps.length) firebase.initializeApp(config);
}
