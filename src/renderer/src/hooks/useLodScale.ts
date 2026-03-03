/**
 * useLodScale — zoom 중에는 렌더링 없이, LOD 임계값을 넘을 때만 업데이트
 *
 * scale이 계속 바뀌어도 React re-render를 유발하지 않는다.
 * LOD 전환 임계값(기본 [0.3, 0.4, 0.6, 0.7])을 넘을 때만 state를 업데이트한다.
 */
import { useState, useEffect } from 'react'
import { useCanvasStore } from '../stores/canvasStore'

function getBucket(scale: number, thresholds: number[]): number {
  for (let i = 0; i < thresholds.length; i++) {
    if (scale < thresholds[i]) return i
  }
  return thresholds.length
}

export function useLodScale(thresholds = [0.3, 0.4, 0.6, 0.7]): number {
  const [scale, setScale] = useState(() => useCanvasStore.getState().scale)

  useEffect(() => {
    let currentBucket = getBucket(useCanvasStore.getState().scale, thresholds)

    const unsub = useCanvasStore.subscribe(state => {
      const newBucket = getBucket(state.scale, thresholds)
      if (newBucket !== currentBucket) {
        currentBucket = newBucket
        setScale(state.scale)
      }
    })

    return unsub
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return scale
}
