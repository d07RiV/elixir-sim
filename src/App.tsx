import classNames from 'classnames'
import React from 'react'
import './App.scss'
import { EffectTooltip, ElixirTooltip } from './Tooltip'
import { formatHtml } from './format'
import Data from './sim/data'
import { numberValue } from './sim/number'
import {
  AffectedTargets,
  modifierAffectedTargets,
  stateAddEffect,
  stateApplyModifier,
  statePreviewModifier,
  stateRerollOptions,
  stateSelectSage,
  stateSelectTarget,
  stateTransmute
} from './sim/sim'
import {
  ElixirState,
  bodyParts,
  createElixir,
  effectLevel,
  elixirGrades
} from './sim/state'

function ElixirCreator({
  setState
}: {
  setState: (state: ElixirState) => void
}) {
  const [charClass, setCharClass] = React.useState(102)
  return (
    <div className="ElixirCreator">
      <select
        value={charClass}
        onChange={(e) => setCharClass(Number(e.target.value))}>
        {Object.keys(Data.classes)
          .map(Number)
          .filter((id) => Data.classes[id].baseClass === id)
          .map((base) => (
            <optgroup key={base} label={Data.classes[base].name}>
              {Object.keys(Data.classes)
                .map(Number)
                .filter(
                  (id) => Data.classes[id].baseClass === base && id !== base
                )
                .map((id) => (
                  <option key={id} value={id}>
                    {Data.classes[id].name}
                  </option>
                ))}
            </optgroup>
          ))}
      </select>
      <div
        className="elixir-item epic"
        onClick={() => setState(createElixir('epic', charClass))}>
        <div className="icon" />
        <div className="name">{Data.strings['tip.name.item_66160200']}</div>
      </div>
      <div
        className="elixir-item leg"
        onClick={() => setState(createElixir('legendary', charClass))}>
        <div className="icon" />
        <div className="name">{Data.strings['tip.name.item_66160300']}</div>
      </div>
    </div>
  )
}

type StateSetter = (
  value:
    | ElixirState
    | undefined
    | ((prev: ElixirState) => ElixirState | undefined)
) => void

type StateParams = {
  state: ElixirState
  setState: StateSetter
}

function SageEffect({ state, index }: { state: ElixirState; index: number }) {
  const id = state.context.modifiers[index]
  const text =
    Data.strings[`sys.elixir.ui_enhance_option_selection_slot_${index + 1}`]
  const effect = Data.effects[id]
  return (
    <>
      <div className="content">
        {formatHtml(
          text,
          effect.title,
          `(${Data.strings[bodyParts[effect.partType].uiString]})`
        )}
      </div>
      <EffectTooltip id={id} maxLevel={elixirGrades[state.grade].maxLevel} />
    </>
  )
}

function SageModifier({ state, index }: { state: ElixirState; index: number }) {
  const id = state.context.modifiers[index]
  const mod = Data.modifiers[id]
  return (
    <div className="content">
      {formatHtml(
        [mod.desc1, mod.desc2, mod.desc3][index],
        ...state.effects.map((fx) => Data.effects[fx.id].title)
      )}
    </div>
  )
}

function SageButton({
  state,
  index,
  setState
}: {
  index: number
} & StateParams) {
  const onClick = React.useCallback(
    () => setState((state) => stateSelectSage(state, index)),
    [setState, index]
  )

  const sage = state.sages[index]

  const active = state.context.pickedSage === index
  const disabled = !active && (sage.disabled || state.context.modifierApplied)

  return (
    <div
      className={classNames('sageButton', {
        disabled,
        active,
        order: sage.order >= 3,
        chaos: sage.chaos >= 6
      })}
      onClick={disabled ? undefined : onClick}>
      {state.effects.length < 5 ? (
        <SageEffect state={state} index={index} />
      ) : (
        <SageModifier state={state} index={index} />
      )}
      {!sage.disabled && (sage.order > 0 || sage.chaos > 0) && (
        <div
          className={classNames('stars', {
            order: sage.order > 0,
            chaos: sage.chaos > 0
          })}>
          {sage.order > 0
            ? [1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={classNames('star', { active: sage.order >= i })}
                />
              ))
            : [1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={classNames('star', { active: sage.chaos >= i })}
                />
              ))}
        </div>
      )}
    </div>
  )
}

function ContinueButton({
  state,
  setState,
  targets
}: { targets: AffectedTargets } & StateParams) {
  if (state.effects.length < 5) {
    const active = state.context.pickedSage >= 0
    const disabled = !active
    const onClick = () => setState((state) => stateAddEffect(state))
    return (
      <div
        className={classNames('continueButton', { disabled, active })}
        onClick={disabled ? undefined : onClick}>
        {formatHtml(Data.strings['sys.elixir.ui_btn_option_refine'])}
      </div>
    )
  } else if (state.context.modifierApplied) {
    const onClick = () => setState((state) => stateTransmute(state))
    return (
      <div className="continueButton active" onClick={onClick}>
        {formatHtml(Data.strings['sys.elixir.ui_enhance_btn_execute'])}
      </div>
    )
  } else {
    const disabled =
      state.context.pickedSage < 0 ||
      (targets.pick && state.context.pickedTarget < 0)
    const onClick = () => setState((state) => stateApplyModifier(state))
    return (
      <div
        className={classNames('continueButton', { disabled })}
        onClick={disabled ? undefined : onClick}>
        {formatHtml(Data.strings['sys.elixir.ui_btn_selection_confirm'])}
      </div>
    )
  }
}

function ExitButton({ setState }: { setState: StateSetter }) {
  return (
    <div className="exitButton" onClick={() => setState(undefined)}>
      {formatHtml(Data.strings['sys.elixir.btn_enhance_exit'])}
    </div>
  )
}

function effectChance(state: ElixirState, index: number) {
  if (!state.effects[index]) return 0
  const total = state.context.effectPool.reduce(
    (sum, i) =>
      sum + (state.effects[i] ? numberValue(state.effects[i].chance) : 0),
    0
  )
  if (!state.context.effectPool.includes(index)) {
    return 0
  } else {
    return (numberValue(state.effects[index].chance) * 10000) / total
  }
}

function compareClass(value: number, next: number | undefined) {
  if (next == null) return undefined
  if (next > value) return 'increase'
  if (next < value) return 'decrease'
  return undefined
}

function EffectPanel({
  state,
  setState,
  index,
  targets,
  preview
}: {
  index: number
  targets: AffectedTargets
  preview: ElixirState | undefined
} & StateParams) {
  const effectState = state.effects[index] ?? preview?.effects[index]
  const previewState = preview?.effects[index]
  const effect = effectState ? Data.effects[effectState.id] : undefined

  let highlight = false
  let active = false
  let picking = false
  if (state.effects.length < 5) {
    highlight = state.effects.length === index
  } else if (targets.pick) {
    picking = targets.targets.includes(index)
    if (state.context.pickedTarget >= 0) {
      active = state.context.pickedTarget === index
    } else {
      active = picking
    }
  } else if (targets.targetCount === targets.targets.length) {
    if (state.context.modifierApplied) {
      active = targets.targets.includes(index)
    } else {
      highlight = targets.targets.includes(index)
    }
  }

  const onClick = React.useCallback(() => {
    if (!targets.pick) return
    if (!targets.targets.includes(index)) return
    setState((state) => {
      if (state.effects.length < 5) return state
      if (state.context.modifierApplied) return state
      return stateSelectTarget(state, index)
    })
  }, [targets, setState, index])

  if (!effect) {
    return (
      <div className={classNames('effectPanel empty', { highlight, active })}>
        <div className="name">
          {formatHtml(
            Data.strings['sys.elixir.ui_guide_option_refine_empty_slot']
          )}
        </div>
      </div>
    )
  }

  const grade = elixirGrades[state.grade]
  const level = effectLevel(effectState.points, state.grade)

  const chance = effectChance(state, index)
  const critical = numberValue(effectState.critical)

  const previewChance = preview && effectChance(preview, index)
  const previewCritical = previewState && numberValue(previewState.critical)

  return (
    <div
      className={classNames('effectPanel', { highlight, active, picking })}
      onClick={onClick}>
      <div className="name">
        {formatHtml(
          Data.strings['sys.elixir.ui_enchant_option'],
          level,
          effect.title
        )}
      </div>
      <div className="type">
        ({formatHtml(Data.strings[bodyParts[effect.partType].uiString])})
      </div>
      {state.effects.length >= 5 &&
        ((previewState ?? effectState).sealed ? (
          <div className="chance sealed">
            {formatHtml(Data.strings['sys.elixir.ui_option_deactivated'])}
          </div>
        ) : (
          <div
            className={classNames(
              'chance',
              compareClass(chance, previewChance)
            )}>
            {((previewChance ?? chance) / 100).toFixed(1)}
            <span className="pct">%</span>
          </div>
        ))}
      {state.effects.length >= 5 && (
        <div
          className={classNames(
            'critical',
            compareClass(critical, previewCritical)
          )}>
          {((previewCritical ?? critical) / 100).toFixed(1)}
          <span className="pct">%</span>
        </div>
      )}
      <div className={`points level-${level}`}>
        {[...Array(grade.maxPoints)].map((_, i) => {
          const major = grade.pointsPerLevel.indexOf(i + 1)
          return (
            <div
              key={i}
              className={classNames('point', {
                major: major >= 0,
                active: effectState.points > i
              })}>
              {major >= 0 ? major + 1 : null}
            </div>
          )
        })}
      </div>
      <EffectTooltip
        id={effectState.id}
        level={level}
        maxLevel={grade.maxLevel}
      />
    </div>
  )
}

function ElixirPrice({ state }: { state: ElixirState }) {
  const grade = elixirGrades[state.grade]
  const modifier = numberValue(state.goldModifier)

  return (
    <>
      <div className="priceMaterials">
        <div className="header">
          {formatHtml(Data.strings['sys.elixir.ui_enhance_material_title'])}
        </div>
        <div className="item">
          <div className="icon" />
          <div className="name">{Data.strings['tip.name.item_66160011']}</div>
          <div className="amount">{grade.catalystsPerStep}</div>
        </div>
      </div>
      <div className="priceGold">
        <div className="header">
          {formatHtml(Data.strings['sys.elixir.ui_enhance_cost_title'])}
        </div>
        <div className="item">
          <div className="name">
            {Data.strings['sys.elixir.ui_refine_cost_need']}
          </div>
          <div className="amount">
            {Math.round(
              Math.max(0, (grade.goldPerStep * (10000 + modifier)) / 10000)
            )}
          </div>
          <div className="icon" />
        </div>
      </div>
    </>
  )
}

function ElixirStep({ state }: { state: ElixirState }) {
  const grade = elixirGrades[state.grade]
  return (
    <div className="remainingSteps">
      {formatHtml(
        Data.strings['sys.elixir.ui_enhance_count_enable'],
        grade.steps - state.step + 1
      )}
    </div>
  )
}

function ElixirGuide({ state }: { state: ElixirState }) {
  if (state.effects.length < 5) {
    return (
      <>
        <div className="guide-top">
          {formatHtml(Data.strings['sys.elixir.ui_main_refine_guide'])}
        </div>
        <ElixirPrice state={state} />
      </>
    )
  } else if (state.context.modifierApplied) {
    return (
      <>
        <ElixirPrice state={state} />
        <ElixirStep state={state} />
      </>
    )
  } else {
    return (
      <>
        <div className="guide-middle">
          <div>
            {formatHtml(Data.strings['sys.elixir.ui_main_selection_guide'])}
          </div>
        </div>
        <ElixirStep state={state} />
      </>
    )
  }
}

function RerollButton({ state, setState }: StateParams) {
  if (state.context.modifierApplied) return null
  const onClick = () => setState((state) => stateRerollOptions(state))
  return (
    <div
      className={classNames('rerollButton', { disabled: !state.rerolls })}
      onClick={onClick}>
      {formatHtml(
        Data.strings['sys.elixir.ui_option_enhance_reroll'],
        state.rerolls
      )}
    </div>
  )
}

function ElixirEditor({
  state,
  setState
}: {
  state: ElixirState
  setState: StateSetter
}) {
  const targets = React.useMemo(() => modifierAffectedTargets(state), [state])
  const preview = React.useMemo(() => statePreviewModifier(state), [state])
  const { steps } = elixirGrades[state.grade]
  return (
    <div className="elixirWrapper">
      <div className="ElixirEditor">
        {state.step <= steps && (
          <div className="sageButtons">
            {[0, 1, 2].map((index) => (
              <SageButton
                key={index}
                state={state}
                setState={setState}
                index={index}
              />
            ))}
          </div>
        )}
        {state.step <= steps && (
          <ContinueButton state={state} setState={setState} targets={targets} />
        )}
        <ExitButton setState={setState} />
        <div className="panels">
          {[0, 1, 2, 3, 4].map((index) => (
            <EffectPanel
              key={index}
              state={state}
              setState={setState}
              index={index}
              targets={targets}
              preview={preview}
            />
          ))}
        </div>
        {state.step <= steps && <ElixirGuide state={state} />}
        <RerollButton state={state} setState={setState} />

        {state.step > steps && (
          <div className="tooltipWrapper">
            <ElixirTooltip state={state} />
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  const [state, setState] = React.useState<ElixirState>()

  const safeSetter = React.useCallback<StateSetter>((value) => {
    if (typeof value === 'function') {
      setState((state) => {
        if (!state) return state
        return value(state)
      })
    } else {
      setState(value)
    }
  }, [])

  if (!state) {
    return <ElixirCreator setState={setState} />
  } else {
    return <ElixirEditor state={state} setState={safeSetter} />
  }
}

export default App
