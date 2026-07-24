import { useState } from 'react'
import Navigation from './components/Navigation'
import DataBackup from './components/DataBackup'
import Bookings from './components/Bookings'
import Sightseeing from './components/Sightseeing'
import Route from './components/Route'
import Etappen from './components/Etappen'
import Events from './components/Events'
import Restaurants from './components/Restaurants'
import './App.css'

function App() {
  const [current, setCurrent] = useState('etappen')

  return (
    <div className="app">
      <header className="app-header">
        <h1>Urlaub-App</h1>
        <Navigation current={current} onChange={setCurrent} />
        <DataBackup />
      </header>

      <main className="app-main">
        {current === 'etappen' ? (
          <Etappen />
        ) : current === 'buchungen' ? (
          <Bookings />
        ) : current === 'reiseroute' ? (
          <Route />
        ) : current === 'events' ? (
          <Events />
        ) : current === 'restaurants' ? (
          <Restaurants />
        ) : (
          <Sightseeing />
        )}
      </main>
    </div>
  )
}

export default App
