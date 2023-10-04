import classNames from 'classnames'
import React, { ReactNode } from 'react'
import { formatHtml } from './format'
import Data from './sim/data'
import { ElixirState, bodyParts, effectLevel, elixirGrades } from './sim/state'

import './Tooltip.scss'

function _F(id: string, ...args: ReactNode[]) {
  return formatHtml(Data.strings[id], ...args)
}

export function EffectTooltip({
  id,
  level,
  maxLevel
}: {
  id: number
  level?: number
  maxLevel?: number
}) {
  const effect = Data.effects[id]
  if (!effect) return null

  const desc = [
    effect.descLv1,
    effect.descLv2,
    effect.descLv3,
    effect.descLv4,
    effect.descLv5
  ]

  const set = Data.sets[effect.set]

  return (
    <div className="effectTooltip">
      <div className="title">{formatHtml(effect.title)}</div>
      <div className="slot">{_F(bodyParts[effect.partType].tooltipString)}</div>
      <div className="levels">
        {_F('sys.elixir.tooltip_enhance_option_title')}
      </div>
      {desc.slice(0, maxLevel ?? 5).map((line, index) => (
        <div
          key={index}
          className={classNames('effect', {
            active: level != null && index === level - 1
          })}>
          {_F('sys.elixir.tooltip_enhance_option_level', index + 1)}
          {formatHtml(line)}
        </div>
      ))}
      {!!set && (
        <>
          <div className="setName">{formatHtml(set[0].name)}</div>
          {set.map((fx, index) => (
            <React.Fragment key={index}>
              <div className="setLevel">
                {_F(
                  'sys.item.tooltip_elixir_additional_option_sub',
                  index + 1,
                  _F('tip.name.enum_elixirtype_voldaik'),
                  fx.levelSum
                )}
              </div>
              <div className="setEffect">{formatHtml(fx.desc)}</div>
            </React.Fragment>
          ))}
        </>
      )}
    </div>
  )
}

export function ElixirTooltip({ state }: { state: ElixirState }) {
  const grade = elixirGrades[state.grade]
  const setEffect = state.effects.find((fx) => {
    if (fx.sealed || !effectLevel(fx.points, state.grade)) return false
    const effect = Data.effects[fx.id]
    return effect.set
  })
  const set = setEffect ? Data.sets[Data.effects[setEffect.id].set] : undefined
  return (
    <div className={`elixirTooltip item-${state.grade}`}>
      <div className="itemTitle">{_F(grade.itemName)}</div>
      <div className="itemBody">
        <div className="itemHeader">
          <div className="itemIcon" />
          <div className="itemHeaderInfo">
            <div className="itemGrade">
              {_F('sys.tip.grade_category', _F(grade.name))}
            </div>
            <div className="itemLevel">
              {_F('tip.name.tooltip_itemtier', 3)}
            </div>
          </div>
        </div>
        <p className="clearfix">
          {_F('tip.name.common_item_being_picked_up')}
          <br />
          <span className="right">{_F('sys.tip.tilte_trade_unable')}</span>
        </p>
        <div className="itemGroup">
          <div className="groupTitle">
            {_F('sys.elixir.tooltip_title_elixir_option')}
          </div>
          <div className="groupTitle elixirName">
            {_F('tip.name.enum_elixirtype_voldaik')}
          </div>
          <ul>
            {state.effects.map((fx, index) => {
              if (fx.sealed) return null
              const effect = Data.effects[fx.id]
              const level = effectLevel(fx.points, state.grade)
              if (!level) return null
              return (
                <li key={index}>
                  <div>
                    {_F(bodyParts[effect.partType].itemString)}{' '}
                    {formatHtml(effect.title)}{' '}
                    {_F('sys.elixir.tooltip_option_level', level)}
                  </div>
                  <div>
                    {formatHtml(
                      [
                        effect.descLv0,
                        effect.descLv1,
                        effect.descLv2,
                        effect.descLv3,
                        effect.descLv4,
                        effect.descLv5
                      ][level]
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
        {!!set && (
          <div className="itemGroup">
            <div className="groupTitle">
              {_F('sys.item.tooltip_elixir_additional_option_title')}
            </div>
            <div className="groupTitle disabled">{formatHtml(set[0].name)}</div>
            <ul className="disabled">
              {set.map((fx, index) => (
                <li key={index}>
                  <div>
                    {_F(
                      'sys.item.tooltip_elixir_additional_option_sub',
                      index + 1,
                      fx.name,
                      fx.levelSum
                    )}
                  </div>
                  <div>{formatHtml(fx.desc)}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
