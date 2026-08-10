/**
 * Wires the Sprint-1 platform services together once per process.
 *
 * Note which client each service gets -- that is the P-07 boundary in practice:
 * settings and i18n read through the service client because `settings` is not
 * anon-readable (it holds smtp_pass and API keys) and phrase auto-registration
 * writes.
 */
import {
  SettingsService, I18nService, StorageService, AuthService,
  AcademicsService, ContentService, AttendanceService, AssignmentsService,
  QueueService, CodeLabService, WorkspaceService, onyxSql,
  AssessService, ProctorService, AssessAnalyticsService,
  CareerService, PlacementService, ContestService,
  EngageService, SupportService, CampusService, ExaminationsService,
  FinanceService, GuardianService, PlatformService,
  executionProviderFromEnv, runCodeLabWorker,
  type ExecutionProvider, type CodeLabWorkerOptions,
  RegistrationService, VerificationService, PasswordResetService,
  PermissionsService, ProfileService, UsersService, DeviceIpService,
  CategoriesService, CoursesService, SeoService, InstructorsService,
  ContactService, NewsletterService,
  CourseBuilderService, SectionsService, LessonsService,
  MailService, MediaService,
  QuestionsService, QuizService,
  EnrollmentService, CouponService, CartService, WishlistService,
  PaymentService, OfflinePaymentService,
  WatchService, PlayerService, PlayerSettingsService,
  CertificateService, ForumService, ReviewService, InstructorReviewService,
  MessagingService, LiveClassService, ZoomService, CompareService,
  BootcampService, BootcampModuleService, BootcampResourceService,
  BootcampClassService, BootcampPurchaseService,
  TeamPackageService, TeamMemberService,
  TutorCatalogService, TutorScheduleService, TutorBookingService,
  RevenueService, PayoutService,
  SettingsAdminService, PlatformAdminService, CampaignService,
  TenancyService, AuditService, onyxServiceClient,
  BlogService, BlogEngagementService, KnowledgeBaseService, TestimonialService,
  RateLimiter, serviceClient, anonClient, type Db,
} from '@onyx/core';

export interface AppContext {
  db: Db;
  publicDb: Db;
  settings: SettingsService;
  i18n: I18nService;
  storage: StorageService;
  auth: AuthService;
  registration: RegistrationService;
  verification: VerificationService;
  passwordReset: PasswordResetService;
  permissions: PermissionsService;
  profiles: ProfileService;
  users: UsersService;
  deviceIps: DeviceIpService;
  categories: CategoriesService;
  courses: CoursesService;
  seo: SeoService;
  instructors: InstructorsService;
  contact: ContactService;
  newsletter: NewsletterService;
  builder: CourseBuilderService;
  sections: SectionsService;
  lessons: LessonsService;
  watch: WatchService;
  player: PlayerService;
  playerSettings: PlayerSettingsService;
  certificates: CertificateService;
  forum: ForumService;
  reviews: ReviewService;
  instructorReviews: InstructorReviewService;
  blog: BlogService;
  blogEngagement: BlogEngagementService;
  knowledgeBase: KnowledgeBaseService;
  testimonials: TestimonialService;
  messaging: MessagingService;
  liveClasses: LiveClassService;
  compare: CompareService;
  bootcamps: BootcampService;
  bootcampModules: BootcampModuleService;
  bootcampResources: BootcampResourceService;
  bootcampClasses: BootcampClassService;
  bootcampPurchases: BootcampPurchaseService;
  teamPackages: TeamPackageService;
  teamMembers: TeamMemberService;
  tutorCatalog: TutorCatalogService;
  tutorSchedules: TutorScheduleService;
  tutorBookings: TutorBookingService;
  revenue: RevenueService;
  payouts: PayoutService;
  settingsAdmin: SettingsAdminService;
  platformAdmin: PlatformAdminService;
  campaigns: CampaignService;
  // Onyx (ADR-006): a separate product, on `onyx_`-prefixed tables.
  onyxTenancy: TenancyService;
  onyxAudit: AuditService;
  onyxAcademics: AcademicsService;
  onyxContent: ContentService;
  onyxAttendance: AttendanceService;
  onyxAssignments: AssignmentsService;
  onyxQueue: QueueService;
  onyxExecution: ExecutionProvider;
  onyxCodeLab: CodeLabService;
  onyxWorkspaces: WorkspaceService;
  onyxAssess: AssessService;
  onyxProctor: ProctorService;
  onyxAssessAnalytics: AssessAnalyticsService;
  onyxCareer: CareerService;
  onyxPlacement: PlacementService;
  onyxContests: ContestService;
  onyxEngage: EngageService;
  onyxSupport: SupportService;
  onyxCampus: CampusService;
  onyxExams: ExaminationsService;
  onyxFinance: FinanceService;
  onyxGuardians: GuardianService;
  onyxPlatform: PlatformService;
  /** One pass of the Code Lab worker. Also driven by an interval in server.ts. */
  onyxRunWorker: (opts?: CodeLabWorkerOptions) =>
    Promise<{ done: number; retried: number; failed: number }>;
  zoom: ZoomService;
  payments: PaymentService;
  offline: OfflinePaymentService;
  enrollment: EnrollmentService;
  coupons: CouponService;
  cart: CartService;
  wishlist: WishlistService;
  questions: QuestionsService;
  quiz: QuizService;
  mail: MailService;
  media: MediaService;
  webOrigin: string;
  limiter: RateLimiter;
  jwtSecret: string;
}

export function createContext(): AppContext {
  const db = serviceClient();
  const settings = new SettingsService(db);
  const mail = new MailService(settings);
  const onyxDb = onyxServiceClient();
  const onyxAcademics = new AcademicsService(onyxDb);
  // Hoisted because the proctoring service records invigilator decisions
  // through it; a second instance would work but would be a second thing to
  // configure identically.
  const onyxAudit = new AuditService(onyxDb, (m) => console.error('[onyx] ' + m));
  // LAB-02b. The queue is the one part of Onyx that talks to Postgres directly:
  // claiming work is a single FOR UPDATE SKIP LOCKED statement, and PostgREST
  // cannot express it.
  const onyxQueue = new QueueService(onyxSql(), 'api-' + process.pid);
  // LAB-02a. Unconfigured is a first-class outcome -- the bank, workspaces and
  // the queue all work without a sandbox; only running code does not.
  const onyxExecution = executionProviderFromEnv();
  const onyxCodeLab = new CodeLabService(onyxDb, onyxAcademics, onyxQueue, onyxExecution);
  const onyxAttendance = new AttendanceService(onyxDb, onyxAcademics);
  // Career reads across everything before it -- attendance, assessment,
  // practice, projects -- which is what makes a readiness score mean anything.
  const onyxCareer = new CareerService(onyxDb, onyxAcademics, onyxAttendance);
  // CMP-02. Guardians read published marks through this rather than
  // querying onyx_exam_marks themselves, so the 'published only' rule
  // lives in one place.
  const onyxExams = new ExaminationsService(onyxDb, onyxAudit);
  const bootcampPurchases = new BootcampPurchaseService(db, settings);
  const teamMembers = new TeamMemberService(db, settings);
  const revenue = new RevenueService(db);
  const categories = new CategoriesService(db);
  const storage = new StorageService(db);
  const enrollment = new EnrollmentService(db);
  const coupons = new CouponService(db);
  const cart = new CartService(db, enrollment, coupons);
  const payments = new PaymentService(db, settings, cart, enrollment);
  const watch = new WatchService(db);
  const playerSettings = new PlayerSettingsService(db, settings, storage);
  return {
    db,
    publicDb: anonClient(),
    settings,
    i18n: new I18nService(db),
    storage,
    auth: new AuthService(db),
    registration: new RegistrationService(db),
    verification: new VerificationService(db),
    passwordReset: new PasswordResetService(db),
    permissions: new PermissionsService(db),
    profiles: new ProfileService(db),
    users: new UsersService(db),
    deviceIps: new DeviceIpService(db),
    categories,
    courses: new CoursesService(db, categories),
    seo: new SeoService(db, settings),
    instructors: new InstructorsService(db),
    contact: new ContactService(db, mail, settings),
    newsletter: new NewsletterService(db),
    builder: new CourseBuilderService(db),
    sections: new SectionsService(db),
    lessons: new LessonsService(db),
    watch,
    player: new PlayerService(db, enrollment, watch, storage, playerSettings),
    playerSettings,
    certificates: new CertificateService(db, settings),
    forum: new ForumService(db),
    reviews: new ReviewService(db),
    instructorReviews: new InstructorReviewService(db),
    blog: new BlogService(db, settings),
    blogEngagement: new BlogEngagementService(db),
    knowledgeBase: new KnowledgeBaseService(db),
    testimonials: new TestimonialService(db),
    messaging: new MessagingService(db),
    liveClasses: new LiveClassService(db),
    compare: new CompareService(db),
    bootcamps: new BootcampService(db),
    bootcampModules: new BootcampModuleService(db),
    bootcampResources: new BootcampResourceService(db),
    bootcampClasses: new BootcampClassService(db),
    bootcampPurchases,
    teamPackages: new TeamPackageService(db),
    teamMembers,
    tutorCatalog: new TutorCatalogService(db),
    tutorSchedules: new TutorScheduleService(db),
    tutorBookings: new TutorBookingService(db, settings),
    revenue,
    payouts: new PayoutService(db, revenue),
    settingsAdmin: new SettingsAdminService(db, settings),
    platformAdmin: new PlatformAdminService(db),
    campaigns: new CampaignService(db, settings, mail),
    onyxTenancy: new TenancyService(onyxDb),
    onyxAudit,
    onyxAcademics,
    // Onyx shares the port's bucket -- storage is per project, not per schema --
    // and namespaces its own files under onyx/<tenant>/.
    onyxContent: new ContentService(onyxDb, onyxAcademics, storage),
    onyxAttendance,
    onyxAssignments: new AssignmentsService(onyxDb, onyxAcademics),
    onyxQueue,
    onyxExecution,
    onyxCodeLab,
    onyxWorkspaces: new WorkspaceService(onyxDb, onyxAcademics),
    onyxAssess: new AssessService(onyxDb, onyxAcademics),
    onyxProctor: new ProctorService(onyxDb, onyxAudit),
    onyxAssessAnalytics: new AssessAnalyticsService(onyxDb),
    onyxCareer,
    onyxPlacement: new PlacementService(onyxDb, onyxCareer, onyxAttendance),
    onyxContests: new ContestService(onyxDb),
    onyxEngage: new EngageService(onyxDb, onyxAcademics, onyxAudit),
    onyxSupport: new SupportService(onyxDb, onyxAudit),
    onyxCampus: new CampusService(onyxDb, onyxAudit),
    onyxExams,
    onyxFinance: new FinanceService(onyxDb, onyxAudit),
    onyxGuardians: new GuardianService(onyxDb, onyxAudit, onyxExams),
    onyxPlatform: new PlatformService(onyxDb),
    onyxRunWorker: (opts) => runCodeLabWorker(onyxQueue, onyxCodeLab, {
      ...opts, onError: (m) => console.error('[onyx] ' + m),
    }),
    zoom: new ZoomService(settings),
    payments,
    offline: new OfflinePaymentService(db, settings, cart, payments,
      process.env.SUPABASE_JWT_SECRET ?? '', bootcampPurchases, teamMembers),
    enrollment,
    coupons,
    cart,
    wishlist: new WishlistService(db),
    questions: new QuestionsService(db),
    quiz: new QuizService(db),
    mail,
    media: new MediaService(db, storage),
    webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    limiter: new RateLimiter(),
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
  };
}
