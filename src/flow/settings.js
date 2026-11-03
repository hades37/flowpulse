/** Existing scenes have no flag, so their animations remain enabled. */
export function animationEnabled(element) {
  return element?.customData?.flowpulse?.animationEnabled !== false
}

export function withAnimationSetting(element, enabled) {
  return {
    ...(element.customData ?? {}),
    flowpulse: { ...(element.customData?.flowpulse ?? {}), animationEnabled: enabled },
  }
}
