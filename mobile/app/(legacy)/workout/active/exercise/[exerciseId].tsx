import { LegacyRedirect } from '../../../../../src/components/LegacyRedirect'

const FROM = '/workout/active/exercise/:exerciseId'

export default function Legacy() {
  return <LegacyRedirect from={FROM} />
}
