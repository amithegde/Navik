import { render } from 'solid-js/web'
import App from './App'
import './assets/css/themes/dark.css'
import './assets/css/themes/light.css'
import './assets/css/themes/slate.css'
import './assets/css/themes/ocean.css'
import './assets/css/themes/autumn.css'
import './assets/css/themes/sienna.css'
import './assets/css/themes/fjord.css'
import './assets/css/app.css'
import './assets/css/electron-chrome.css'

const root = document.getElementById('app')
if (!root) throw new Error('#app root element not found')

render(() => <App />, root)
