import { json, type DataFunctionArgs } from '@remix-run/node'
import { Link, useFetcher, useNavigate } from '@remix-run/react'
import { useEffect } from 'react'
import { AuthorizationError } from 'remix-auth'
import { FormStrategy } from 'remix-auth-form'
import { z } from 'zod'
import { authenticator } from '~/utils/auth.server'
import {
	CheckboxField,
	Field,
	getFieldsFromSchema,
	preprocessFormData,
	useForm,
} from '~/utils/forms'
import { commitSession, getSession } from '~/utils/session.server'
import { passwordSchema, usernameSchema } from '~/utils/user-validation'

export const LoginFormSchema = z.object({
	username: usernameSchema,
	password: passwordSchema,
	remember: z.boolean(),
})

export async function action({ request }: DataFunctionArgs) {
	const formData = await request.clone().formData()
	const result = LoginFormSchema.safeParse(
		preprocessFormData(formData, LoginFormSchema),
	)
	if (!result.success) {
		return json(
			{ status: 'form-invalid', errors: result.error.flatten() } as const,
			{ status: 400 },
		)
	}

	let userId: string | null = null
	try {
		userId = await authenticator.authenticate(FormStrategy.name, request, {
			throwOnError: true,
		})
	} catch (error) {
		if (error instanceof AuthorizationError) {
			return json(
				{
					status: 'auth-error',
					errors: {
						formErrors: [error.message],
						fieldErrors: {},
					},
				} as const,
				{ status: 400 },
			)
		}
		throw error
	}

	const session = await getSession(request.headers.get('cookie'))
	session.set(authenticator.sessionKey, userId)
	const { remember } = result.data
	const newCookie = await commitSession(session, {
		maxAge: remember
			? 60 * 60 * 24 * 7 // 7 days
			: undefined,
	})
	return json({ status: 'success', errors: null } as const, {
		headers: { 'Set-Cookie': newCookie },
	})
}

export function InlineLogin({
	redirectTo,
	formError,
}: {
	redirectTo?: string
	formError?: string | null
}) {
	const loginFetcher = useFetcher<typeof action>()

	const { form, fields } = useForm({
		name: 'inline-login',
		errors: {
			...loginFetcher.data?.errors,
			formErrors: [
				formError,
				...(loginFetcher.data?.errors?.formErrors ?? []),
			].filter(Boolean),
		},
		fieldMetadatas: getFieldsFromSchema(LoginFormSchema),
	})

	const navigate = useNavigate()
	const success = loginFetcher.data?.status === 'success'
	useEffect(() => {
		if (!redirectTo) return
		if (!success) return

		navigate(redirectTo)
	}, [success, redirectTo])

	return (
		<div>
			<div className="mx-auto w-full max-w-md px-8">
				<loginFetcher.Form
					method="post"
					action="/resources/login"
					{...form.props}
				>
					<Field
						labelProps={{ ...fields.username.labelProps, children: 'Username' }}
						inputProps={{
							...fields.username.props,
							autoComplete: 'username',
						}}
						errors={fields.username.errors}
					/>

					<Field
						labelProps={{ ...fields.password.labelProps, children: 'Password' }}
						inputProps={{
							...fields.password.props,
							autoComplete: 'password',
							type: 'password',
						}}
						errors={fields.password.errors}
					/>

					<div className="flex justify-between">
						<CheckboxField
							labelProps={{
								...fields.remember.labelProps,
								children: 'Remember me',
							}}
							buttonProps={{
								...fields.remember.props,
								type: 'button',
							}}
							errors={fields.remember.errors}
						/>

						<div>
							<Link
								to="/forgot-password"
								className="text-sm font-semibold text-white"
							>
								Forgot password?
							</Link>
						</div>
					</div>

					{form.errorUI}

					<div className="flex items-center justify-between gap-6 pt-3">
						<button
							type="submit"
							className="h-16 w-full rounded-full bg-primary py-3.5 px-10 text-lg font-bold text-white hover:bg-primary-darker"
						>
							Log in
						</button>
					</div>
				</loginFetcher.Form>
				<div className="flex items-center justify-center gap-2 pt-6">
					<span className="text-gray-500">New here?</span>
					<Link to="/signup" className="text-white">
						Create an account
					</Link>
				</div>
			</div>
		</div>
	)
}
