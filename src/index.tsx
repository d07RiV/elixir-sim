import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.scss'
import { DefaultRegion, Region, loadData } from './sim/data'
import { getStoredValue } from './storage'

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement)
const locale = getStoredValue('elixir-lang', DefaultRegion) as Region
loadData(locale).then(() => {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
