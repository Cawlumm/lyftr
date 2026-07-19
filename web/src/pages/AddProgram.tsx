import { programAPI } from '../services/api'
import ProgramBuilder, { emptyTrainingDay } from '../components/ProgramBuilder'

export default function AddProgram() {
  return (
    <ProgramBuilder
      heading="New Program"
      submitLabel="Save Program"
      initial={{ name: '', notes: '', days: [emptyTrainingDay('Day 1')] }}
      onSubmit={payload => programAPI.create(payload).then(() => {})}
    />
  )
}
