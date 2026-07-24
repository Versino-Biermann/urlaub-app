const URL_REGEX = /(https?:\/\/[^\s]+)/g

function getHostname(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export default function LinkedText({ text }) {
  if (!text) return null

  const parts = String(text).split(URL_REGEX)

  return (
    <>
      {parts.map((part, i) => {
        if (part.match(URL_REGEX)) {
          return (
            <a key={i} href={part} target="_blank" rel="noopener noreferrer">
              {getHostname(part)}
            </a>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}
