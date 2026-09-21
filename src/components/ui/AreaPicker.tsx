import { useServiceAreas } from '../../lib/api'
import { SectionLabel } from './SectionLabel'

/**
 * Pick an area from the fixed list. Free text would be friendlier to type
 * but useless to rank on: "Yaba", "yaba, lagos" and "Yaba Lagos" are three
 * different places to a database.
 */
export function AreaPicker({
  value,
  onChange,
  label = 'Area',
  hint,
}: {
  value: string | null
  onChange: (area: string) => void
  label?: string
  hint?: string
}) {
  const { data: areas, isLoading } = useServiceAreas()

  return (
    <div>
      <SectionLabel className="mb-2">{label}</SectionLabel>
      <div className="flex items-center gap-2.5 bg-white border-[1.5px] border-line rounded-lg h-[52px] px-3.5">
        <i className="ph ph-map-pin text-[19px] text-brand" />
        <select
          value={value ?? ''}
          disabled={isLoading}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="flex-1 min-w-0 h-full bg-transparent text-[16px] text-ink outline-none disabled:opacity-50"
        >
          <option value="" disabled>
            {isLoading ? 'Loading areas…' : 'Choose your area'}
          </option>
          {areas?.map((area) => (
            <option key={area.name} value={area.name}>
              {area.name}
            </option>
          ))}
        </select>
      </div>
      {hint && <p className="mt-2 text-[13px] leading-[1.45] text-muted-2">{hint}</p>}
    </div>
  )
}
