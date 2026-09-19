import type { CollectionImage } from '../api/types'
import { ImageCard } from './ImageCard'

interface ImageGridProps {
  collectionId: number
  images: CollectionImage[]
  canEdit: boolean
  onChanged?: (image: CollectionImage) => void
  onRemoved?: (imageId: number) => void
}

/** The images saved in a collection */
export function ImageGrid({ collectionId, images, canEdit, onChanged, onRemoved }: ImageGridProps) {
  return (
    <ul className="card-grid">
      {images.map(image => (
        <li key={image.id}>
          <ImageCard
            collectionId={collectionId}
            image={image}
            canEdit={canEdit}
            onChanged={onChanged}
            onRemoved={onRemoved}
          />
        </li>
      ))}
    </ul>
  )
}
