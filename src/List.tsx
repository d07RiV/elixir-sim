import classNames from 'classnames'
import React from 'react'
import { EffectTooltip } from './Tooltip'
import { formatHtml } from './format'
import Data from './sim/data'
import { ElixirGrade, bodyParts, elixirGrades } from './sim/state'

import './List.scss'

export function ElixirList({
  grade,
  charClass,
  onClose
}: {
  grade: ElixirGrade
  charClass: number
  onClose: () => void
}) {
  const [bodyPart, setBodyPart] = React.useState(0)
  const [effectId, setEffect] = React.useState<number>()
  return (
    <div className="elixirListWrapper">
      <div className="elixirList">
        <div className="titleBar">
          <div className="title">
            {formatHtml(Data.strings['sys.elixir.ui_btn_elixir_option_info'])}
          </div>
          <div className="close" onClick={onClose} />
        </div>
        <div className="body">
          <ul className="itemList">
            {Object.keys(bodyParts)
              .map(Number)
              .map((id) => (
                <li
                  key={id}
                  className={classNames({ active: id === bodyPart })}
                  onClick={() => setBodyPart(id)}>
                  {formatHtml(Data.strings[bodyParts[id].uiString])}
                </li>
              ))}
          </ul>
          <ul className="effectList">
            {Object.keys(Data.effects)
              .map(Number)
              .sort((a, b) =>
                Data.effects[a].title.localeCompare(Data.effects[b].title)
              )
              .map((id) => {
                const effect = Data.effects[id]
                if (effect.classFilter && effect.classFilter !== charClass)
                  return null
                if (effect.partType !== bodyPart) return null
                return (
                  <li
                    key={id}
                    className={classNames({ active: id === effectId })}
                    onClick={() => setEffect(id)}>
                    {formatHtml(effect.title)}
                  </li>
                )
              })}
          </ul>
          <div className="effectPreview">
            {effectId != null && (
              <EffectTooltip
                id={effectId}
                maxLevel={elixirGrades[grade].maxLevel}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
