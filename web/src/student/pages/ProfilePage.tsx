import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../auth/AuthProvider'
import { Loaded, PageHeader } from '../../components/Loaded'
import { useMember } from '../../components/guards'
import { ProfileEditor } from '../components/ProfileEditor'
import { useMyProfile } from '../queries'

/**
 * The profile of a student or a parent. Until it has been confirmed it is the only thing they see (`gate`): a person a
 * teacher added checks what the teacher entered, a person who has nothing there fills it in. Afterwards it is the page the
 * gear in the header opens, and everything on it can be changed.
 */
export function ProfilePage({ gate = false }: { gate?: boolean }) {
  const profile = useMyProfile(useMember().roles.profileId)
  const { reloadRoles } = useAuth()
  const client = useQueryClient()

  return (
    <div className="student">
      <PageHeader title={gate ? 'Profil' : 'Podešavanja'} />
      <Loaded query={profile}>
        {(data) => {
          const filled = data.phone !== null || data.people.some((p) => p.school || p.grade)
          return (
            <>
              {!data.confirmed && (
                <p className="callout">
                  {filled
                    ? 'Proveri podatke koje je upisao nastavnik i potvrdi da su tačni. Ispravi ono što nije.'
                    : data.isParent
                      ? 'Popuni profil da bi dete videli nastavnici.'
                      : 'Popuni profil da bi te videli nastavnici.'}
                </p>
              )}
              <ProfileEditor
                profile={data}
                onSaved={(first) => {
                  void client.invalidateQueries({ queryKey: ['student'] })
                  // the first save opens the rest of the app
                  if (first) reloadRoles()
                }}
              />
            </>
          )
        }}
      </Loaded>
    </div>
  )
}
