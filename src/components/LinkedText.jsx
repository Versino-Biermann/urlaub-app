import { linkLabel } from '../format'

const URL_REGEX = /(https?:\/\/[^\s]+)/g

export default function LinkedText({ text }) {
  if (!text) return null

  const parts = String(text).split(URL_REGEX)

  return (
    <>
      {parts.map((part, i) => {
        if (part.match(URL_REGEX)) {
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer">
              {linkLabel(part)}
            </a>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
