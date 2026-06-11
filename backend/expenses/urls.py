from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'expenses/categories', views.ExpenseCategoryViewSet, basename='expensecategory')
router.register(r'vendors', views.VendorViewSet, basename='vendor')
router.register(r'expenses', views.ExpenseViewSet, basename='expense')
router.register(r'vendor-bills', views.VendorBillViewSet, basename='vendorbill')
router.register(r'accounting/cashbook', views.TransactionLogViewSet, basename='transactionlog')

urlpatterns = [path('', include(router.urls))]
