export const formulaIndex = [
  { key: 'clarke', name: 'Clarke 变换', expression: 'Iα = Ia, Iβ = (Ia + 2Ib) / √3' },
  { key: 'park', name: 'Park 变换', expression: 'Id = Iα cosθ + Iβ sinθ, Iq = -Iα sinθ + Iβ cosθ' },
  { key: 'torque', name: 'PMSM 转矩', expression: 'Te = 1.5 p [ψf Iq + (Ld - Lq) Id Iq]' },
  { key: 'svpwm', name: 'SVPWM 调制比', expression: 'm = √3 |Uref| / Udc' },
  { key: 'voltage-limit', name: '电压极限', expression: '√(Vd² + Vq²) ≤ Udc / √3' },
];
